package database

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"strconv"
	"strings"

	"github.com/0x1d/bench/api/internal/db"
	"github.com/0x1d/bench/api/internal/model"
	"github.com/jackc/pgx/v5"
)

// ListTables returns all tables in the public schema with approximate row counts.
func ListTables(ctx context.Context) ([]model.TableInfo, error) {
	if !db.Configured() {
		return nil, fmt.Errorf("database not configured")
	}
	rows, err := db.Pool.Query(ctx, `
		SELECT t.tablename
		FROM pg_tables t
		WHERE t.schemaname = 'public'
		  AND t.tablename NOT LIKE '__bench_m2m_%'
		ORDER BY t.tablename
	`)
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}
	defer rows.Close()

	var tables []model.TableInfo
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan table: %w", err)
		}
		// Use exact COUNT(*) so row numbers reflect writes immediately.
		var rowCount int
		if err := db.Pool.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %q", name)).Scan(&rowCount); err != nil {
			return nil, fmt.Errorf("count rows for %s: %w", name, err)
		}
		tables = append(tables, model.TableInfo{Name: name, Rows: rowCount})
	}
	return tables, rows.Err()
}

// escapeLike escapes % and _ for safe use in ILIKE patterns.
func escapeLike(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '\\', '%', '_':
			b.WriteRune('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// GetTableData returns paginated rows from a table. If search is non-empty, filters rows
// where any column (as text) contains the search term (case-insensitive).
func GetTableData(ctx context.Context, tableName string, limit, offset int, search string) (*model.TableDataResponse, error) {
	if !db.Configured() {
		return nil, fmt.Errorf("database not configured")
	}
	if !isValidIdentifier(tableName) {
		return nil, fmt.Errorf("invalid table name")
	}

	// Get column names
	colRows, err := db.Pool.Query(ctx, `
		SELECT column_name FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = $1
		ORDER BY ordinal_position
	`, tableName)
	if err != nil {
		return nil, fmt.Errorf("get columns: %w", err)
	}
	defer colRows.Close()

	var columns []string
	for colRows.Next() {
		var col string
		if err := colRows.Scan(&col); err != nil {
			return nil, fmt.Errorf("scan column: %w", err)
		}
		columns = append(columns, col)
	}
	if err := colRows.Err(); err != nil {
		return nil, err
	}
	if len(columns) == 0 {
		return nil, fmt.Errorf("table not found: %s", tableName)
	}

	// Build WHERE clause for search (ILIKE across all columns)
	quotedCols := make([]string, len(columns))
	for i, c := range columns {
		quotedCols[i] = fmt.Sprintf("%q", c)
	}
	whereClause := ""
	var pattern string
	if search != "" {
		escaped := escapeLike(strings.TrimSpace(search))
		pattern = "%" + escaped + "%"
		conds := make([]string, len(columns))
		for i, c := range columns {
			conds[i] = fmt.Sprintf("%q::text ILIKE $1 ESCAPE '\\'", c)
		}
		whereClause = " WHERE " + strings.Join(conds, " OR ")
	}

	// Get total count
	var total int
	if whereClause == "" {
		err = db.Pool.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %q", tableName)).Scan(&total)
	} else {
		args := []any{pattern}
		err = db.Pool.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %q%s", tableName, whereClause), args...).Scan(&total)
	}
	if err != nil {
		return nil, fmt.Errorf("count rows: %w", err)
	}

	// Build SELECT query (with search: $1=pattern, $2=limit, $3=offset)
	limitArg, offsetArg := 1, 2
	if whereClause != "" {
		limitArg, offsetArg = 2, 3
	}
	query := fmt.Sprintf(
		"SELECT %s FROM %q%s ORDER BY 1 LIMIT $%d OFFSET $%d",
		strings.Join(quotedCols, ", "),
		tableName,
		whereClause,
		limitArg, offsetArg,
	)
	var rows pgx.Rows
	if whereClause == "" {
		rows, err = db.Pool.Query(ctx, query, limit, offset)
	} else {
		rows, err = db.Pool.Query(ctx, query, append([]any{pattern}, limit, offset)...)
	}
	if err != nil {
		return nil, fmt.Errorf("query table: %w", err)
	}
	defer rows.Close()

	var result [][]any
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, vals)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &model.TableDataResponse{
		Columns: columns,
		Rows:    result,
		Total:   total,
	}, nil
}

// GetTableLookup returns rows from a table for FK lookup, with optional search.
func GetTableLookup(ctx context.Context, tableName, valueColumn, search string, limit int) (*model.TableDataResponse, error) {
	if !db.Configured() {
		return nil, fmt.Errorf("database not configured")
	}
	if !isValidIdentifier(tableName) || !isValidIdentifier(valueColumn) {
		return nil, fmt.Errorf("invalid table or column name")
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	colRows, err := db.Pool.Query(ctx, `
		SELECT column_name FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = $1
		ORDER BY ordinal_position
	`, tableName)
	if err != nil {
		return nil, fmt.Errorf("get columns: %w", err)
	}
	defer colRows.Close()

	var columns []string
	for colRows.Next() {
		var col string
		if err := colRows.Scan(&col); err != nil {
			return nil, fmt.Errorf("scan column: %w", err)
		}
		columns = append(columns, col)
	}
	colRows.Close()
	if len(columns) == 0 {
		return nil, fmt.Errorf("table not found: %s", tableName)
	}

	quotedCols := make([]string, len(columns))
	for i, c := range columns {
		quotedCols[i] = fmt.Sprintf("%q", c)
	}

	var query string
	var args []any
	if search != "" {
		searchPattern := "%" + search + "%"
		likeClauses := make([]string, len(columns))
		for i, c := range columns {
			likeClauses[i] = fmt.Sprintf("%q::text ILIKE $1", c)
		}
		query = fmt.Sprintf(
			"SELECT %s FROM %q WHERE %s ORDER BY %q LIMIT $2",
			strings.Join(quotedCols, ", "),
			tableName,
			strings.Join(likeClauses, " OR "),
			valueColumn,
		)
		args = []any{searchPattern, limit}
	} else {
		query = fmt.Sprintf(
			"SELECT %s FROM %q ORDER BY %q LIMIT $1",
			strings.Join(quotedCols, ", "),
			tableName,
			valueColumn,
		)
		args = []any{limit}
	}

	rows, err := db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("lookup: %w", err)
	}
	defer rows.Close()

	var result [][]any
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, vals)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &model.TableDataResponse{
		Columns: columns,
		Rows:    result,
		Total:   len(result),
	}, nil
}

// GetTableSchema returns column names and types for a table.
func GetTableSchema(ctx context.Context, tableName string) (*model.TableSchemaResponse, error) {
	if !db.Configured() {
		return nil, fmt.Errorf("database not configured")
	}
	if !isValidIdentifier(tableName) {
		return nil, fmt.Errorf("invalid table name")
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT c.column_name,
		COALESCE(format_type(a.atttypid, a.atttypmod), c.data_type),
		c.is_nullable,
		COALESCE(c.column_default, '') LIKE 'nextval%',
		COALESCE(col_description(c2.oid, a.attnum), '')
		FROM information_schema.columns c
		JOIN pg_catalog.pg_class c2 ON c2.relname = c.table_name
		JOIN pg_catalog.pg_namespace n ON c2.relnamespace = n.oid AND n.nspname = c.table_schema
		JOIN pg_catalog.pg_attribute a ON a.attrelid = c2.oid AND a.attname = c.column_name AND a.attnum > 0 AND NOT a.attisdropped
		WHERE c.table_schema = 'public' AND c.table_name = $1
		ORDER BY c.ordinal_position
	`, tableName)
	if err != nil {
		return nil, fmt.Errorf("get schema: %w", err)
	}
	defer rows.Close()

	var cols []model.ColumnInfo
	for rows.Next() {
		var name, dataType, isNullable, comment string
		var isAuto bool
		if err := rows.Scan(&name, &dataType, &isNullable, &isAuto, &comment); err != nil {
			return nil, fmt.Errorf("scan column: %w", err)
		}
		col := model.ColumnInfo{
			Name:          name,
			DataType:      dataType,
			Required:      isNullable == "NO",
			AutoIncrement: isAuto,
		}
		// Parse ref:table:column or ref:table:column:multiple from column comment
		if ref := parseRefComment(comment); ref != nil {
			col.References = ref
		}
		// Fallback: array types (integer[], etc.) without comment - infer Multiple from type
		if col.References != nil && strings.Contains(dataType, "[]") {
			col.References.Multiple = true
		}
		cols = append(cols, col)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(cols) == 0 {
		return nil, fmt.Errorf("table not found: %s", tableName)
	}

	// Primary keys
	pkRows, err := db.Pool.Query(ctx, `
		SELECT kcu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
	`, tableName)
	if err != nil {
		return nil, fmt.Errorf("get primary keys: %w", err)
	}
	pkCols := make(map[string]bool)
	for pkRows.Next() {
		var col string
		if err := pkRows.Scan(&col); err != nil {
			pkRows.Close()
			return nil, fmt.Errorf("scan pk: %w", err)
		}
		pkCols[col] = true
	}
	pkRows.Close()

	// Foreign keys: column -> (ref_table, ref_column)
	fkRows, err := db.Pool.Query(ctx, `
		SELECT kcu.column_name, ccu.table_name, ccu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		JOIN information_schema.constraint_column_usage ccu
			ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
		WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'
	`, tableName)
	if err != nil {
		return nil, fmt.Errorf("get foreign keys: %w", err)
	}
	fkMap := make(map[string]model.ForeignKeyRef)
	for fkRows.Next() {
		var col, refTable, refCol string
		if err := fkRows.Scan(&col, &refTable, &refCol); err != nil {
			fkRows.Close()
			return nil, fmt.Errorf("scan fk: %w", err)
		}
		fkMap[col] = model.ForeignKeyRef{Table: refTable, Column: refCol}
	}
	fkRows.Close()

	for i := range cols {
		cols[i].PrimaryKey = pkCols[cols[i].Name]
		if cols[i].References == nil {
			if ref, ok := fkMap[cols[i].Name]; ok {
				cols[i].References = &ref
			}
		}
	}

	return &model.TableSchemaResponse{Columns: cols}, nil
}

// UpdateRow updates a row matching the where clause.
func UpdateRow(ctx context.Context, tableName string, where, set map[string]any) error {
	if !db.Configured() {
		return fmt.Errorf("database not configured")
	}
	if !isValidIdentifier(tableName) {
		return fmt.Errorf("invalid table name")
	}
	if len(where) == 0 {
		return fmt.Errorf("where must have at least one column")
	}
	if len(set) == 0 {
		return fmt.Errorf("set must have at least one column")
	}

	schema, err := GetTableSchema(ctx, tableName)
	if err != nil {
		return err
	}
	validCols := make(map[string]model.ColumnInfo)
	for _, c := range schema.Columns {
		validCols[c.Name] = c
	}
	manySet := make(map[string]any)
	for k, v := range set {
		if col, ok := validCols[k]; ok && col.References != nil && col.References.Multiple {
			manySet[k] = v
		}
	}

	var ownerPK string
	var ownerVals []any
	if len(manySet) > 0 {
		ownerPK, err = getSinglePrimaryKeyColumn(ctx, tableName)
		if err != nil {
			return err
		}
		ownerVals, err = selectOwnerValuesByWhere(ctx, tableName, ownerPK, where, validCols)
		if err != nil {
			return err
		}
	}

	var setParts []string
	var setVals []any
	argNum := 1
	for k, v := range set {
		col, ok := validCols[k]
		if !ok {
			return fmt.Errorf("unknown column: %s", k)
		}
		setParts = append(setParts, fmt.Sprintf("%q = $%d", k, argNum))
		setVals = append(setVals, normalizeArrayValue(v, col))
		argNum++
	}

	var whereParts []string
	for k, v := range where {
		col, ok := validCols[k]
		if !ok {
			return fmt.Errorf("unknown column: %s", k)
		}
		if v == nil {
			whereParts = append(whereParts, fmt.Sprintf("%q IS NULL", k))
		} else {
			whereParts = append(whereParts, fmt.Sprintf("%q = $%d", k, argNum))
			setVals = append(setVals, normalizeArrayValue(v, col))
			argNum++
		}
	}

	query := fmt.Sprintf(
		"UPDATE %q SET %s WHERE %s",
		tableName,
		strings.Join(setParts, ", "),
		strings.Join(whereParts, " AND "),
	)
	result, err := db.Pool.Exec(ctx, query, setVals...)
	if err != nil {
		return fmt.Errorf("update row: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("no rows matched")
	}
	if len(manySet) > 0 {
		for _, ownerVal := range ownerVals {
			for colName, raw := range manySet {
				ref := validCols[colName].References
				if ref == nil || !ref.Multiple {
					continue
				}
				if err := syncManyRefJoinRows(ctx, tableName, colName, ref, ownerVal, raw); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// DeleteRow deletes rows matching the where clause.
func DeleteRow(ctx context.Context, tableName string, where map[string]any) error {
	if !db.Configured() {
		return fmt.Errorf("database not configured")
	}
	if !isValidIdentifier(tableName) {
		return fmt.Errorf("invalid table name")
	}
	if len(where) == 0 {
		return fmt.Errorf("where must have at least one column")
	}

	schema, err := GetTableSchema(ctx, tableName)
	if err != nil {
		return err
	}
	validCols := make(map[string]model.ColumnInfo)
	for _, c := range schema.Columns {
		validCols[c.Name] = c
	}

	var whereParts []string
	var vals []any
	argNum := 1
	for k, v := range where {
		if _, ok := validCols[k]; !ok {
			return fmt.Errorf("unknown column: %s", k)
		}
		if v == nil {
			whereParts = append(whereParts, fmt.Sprintf("%q IS NULL", k))
		} else {
			whereParts = append(whereParts, fmt.Sprintf("%q = $%d", k, argNum))
			vals = append(vals, v)
			argNum++
		}
	}

	query := fmt.Sprintf("DELETE FROM %q WHERE %s", tableName, strings.Join(whereParts, " AND "))
	result, err := db.Pool.Exec(ctx, query, vals...)
	if err != nil {
		return fmt.Errorf("delete row: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("no rows matched")
	}
	return nil
}

// InsertRow inserts a row into a table.
func InsertRow(ctx context.Context, tableName string, row map[string]any) error {
	if !db.Configured() {
		return fmt.Errorf("database not configured")
	}
	if !isValidIdentifier(tableName) {
		return fmt.Errorf("invalid table name")
	}
	if len(row) == 0 {
		return fmt.Errorf("row must have at least one column")
	}

	schema, err := GetTableSchema(ctx, tableName)
	if err != nil {
		return err
	}

	validCols := make(map[string]model.ColumnInfo)
	for _, c := range schema.Columns {
		validCols[c.Name] = c
	}
	manySet := make(map[string]any)

	var cols []string
	var vals []any
	var placeholders []string
	i := 1
	for k, v := range row {
		col, ok := validCols[k]
		if !ok {
			return fmt.Errorf("unknown column: %s", k)
		}
		if v == nil && col.AutoIncrement {
			continue
		}
		if v == nil && col.Required {
			return fmt.Errorf("column %s is required", k)
		}
		cols = append(cols, k)
		vals = append(vals, normalizeArrayValue(v, col))
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		i++
		if col.References != nil && col.References.Multiple {
			manySet[k] = v
		}
	}
	if len(cols) == 0 {
		return fmt.Errorf("row must have at least one column value")
	}

	quotedCols := make([]string, len(cols))
	for i, c := range cols {
		quotedCols[i] = fmt.Sprintf("%q", c)
	}
	insertQuery := fmt.Sprintf(
		"INSERT INTO %q (%s) VALUES (%s)",
		tableName,
		strings.Join(quotedCols, ", "),
		strings.Join(placeholders, ", "),
	)
	if len(manySet) == 0 {
		_, err = db.Pool.Exec(ctx, insertQuery, vals...)
		if err != nil {
			return fmt.Errorf("insert row: %w", err)
		}
		return nil
	}

	ownerPK, err := getSinglePrimaryKeyColumn(ctx, tableName)
	if err != nil {
		return err
	}
	var ownerVal any
	returningQuery := insertQuery + fmt.Sprintf(" RETURNING %q", ownerPK)
	if err := db.Pool.QueryRow(ctx, returningQuery, vals...).Scan(&ownerVal); err != nil {
		return fmt.Errorf("insert row: %w", err)
	}
	for colName, raw := range manySet {
		ref := validCols[colName].References
		if ref == nil || !ref.Multiple {
			continue
		}
		if err := syncManyRefJoinRows(ctx, tableName, colName, ref, ownerVal, raw); err != nil {
			return err
		}
	}
	return nil
}

// AlterTable modifies a table to match the desired column schema.
func AlterTable(ctx context.Context, tableName string, req *model.AlterTableRequest) error {
	if !db.Configured() {
		return fmt.Errorf("database not configured")
	}
	if !isValidIdentifier(tableName) {
		return fmt.Errorf("invalid table name")
	}
	if len(req.Columns) == 0 {
		return fmt.Errorf("at least one column required")
	}

	current, err := GetTableSchema(ctx, tableName)
	if err != nil {
		return err
	}

	currentByName := make(map[string]model.ColumnInfo)
	for _, c := range current.Columns {
		currentByName[c.Name] = c
	}

	desiredByName := make(map[string]model.ColumnDef)
	for _, c := range req.Columns {
		if c.Name == "" {
			return fmt.Errorf("column name required")
		}
		if !isValidIdentifier(c.Name) {
			return fmt.Errorf("invalid column name: %s", c.Name)
		}
		if _, ok := desiredByName[c.Name]; ok {
			return fmt.Errorf("duplicate column name: %s", c.Name)
		}
		desiredByName[c.Name] = c
	}

	quotedTable := fmt.Sprintf("%q", tableName)

	// 1. Drop removed columns
	for name := range currentByName {
		if _, ok := desiredByName[name]; !ok {
			if curRef := currentByName[name].References; curRef != nil && curRef.Multiple {
				if err := dropManyRefJoinTable(ctx, tableName, name); err != nil {
					return err
				}
			}
			query := fmt.Sprintf("ALTER TABLE %s DROP COLUMN %q", quotedTable, name)
			if _, err := db.Pool.Exec(ctx, query); err != nil {
				return fmt.Errorf("drop column %s: %w", name, err)
			}
		}
	}

	// 2. Add new columns
	for _, col := range req.Columns {
		if _, ok := currentByName[col.Name]; !ok {
			var dt string
			if col.References != nil && col.References.Multiple {
				refType, _ := getReferencedColumnDataType(ctx, col.References.Table, col.References.Column)
				dt = refTypeToArrayType(refType)
			} else {
				dt = normalizeDataType(col.DataType, col.AutoIncrement)
			}
			spec := fmt.Sprintf("%q %s", col.Name, dt)
			if col.Required {
				spec += " NOT NULL"
			}
			if col.PrimaryKey {
				spec += " PRIMARY KEY"
			}
			if col.References != nil && !col.References.Multiple {
				if !isValidIdentifier(col.References.Table) || !isValidIdentifier(col.References.Column) {
					return fmt.Errorf("invalid foreign key reference: %s.%s", col.References.Table, col.References.Column)
				}
				if err := checkReferencedColumnIsUnique(ctx, col.References.Table, col.References.Column); err != nil {
					return err
				}
				spec += fmt.Sprintf(" REFERENCES %q (%q)", col.References.Table, col.References.Column)
			}
			query := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s", quotedTable, spec)
			if _, err := db.Pool.Exec(ctx, query); err != nil {
				return fmt.Errorf("add column %s: %w", col.Name, err)
			}
			if col.References != nil && col.References.Multiple {
				comment := fmt.Sprintf("ref:%s:%s:multiple", col.References.Table, col.References.Column)
				if _, err := db.Pool.Exec(ctx, fmt.Sprintf("COMMENT ON COLUMN %s.%q IS %s", quotedTable, col.Name, quoteLiteral(comment))); err != nil {
					return fmt.Errorf("set column comment: %w", err)
				}
				if err := ensureManyRefJoinTable(ctx, tableName, col.Name, col.References); err != nil {
					return err
				}
			}
		}
	}

	// 3. Modify existing columns (type, required)
	for _, col := range req.Columns {
		cur, ok := currentByName[col.Name]
		if !ok {
			continue
		}
		curType := normalizeDataType(cur.DataType, false)
		newType := normalizeDataType(col.DataType, false)
		if curType != newType {
			query := fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %q TYPE %s", quotedTable, col.Name, newType)
			if _, err := db.Pool.Exec(ctx, query); err != nil {
				return fmt.Errorf("alter column %s type: %w", col.Name, err)
			}
		}
		if col.Required != cur.Required {
			if col.Required {
				query := fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %q SET NOT NULL", quotedTable, col.Name)
				if _, err := db.Pool.Exec(ctx, query); err != nil {
					return fmt.Errorf("alter column %s set not null: %w", col.Name, err)
				}
			} else {
				query := fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %q DROP NOT NULL", quotedTable, col.Name)
				if _, err := db.Pool.Exec(ctx, query); err != nil {
					return fmt.Errorf("alter column %s drop not null: %w", col.Name, err)
				}
			}
		}
	}

	// 4. Primary key and foreign key changes for existing columns
	for _, col := range req.Columns {
		cur, ok := currentByName[col.Name]
		if !ok {
			continue
		}

		// Primary key
		if cur.PrimaryKey && !col.PrimaryKey {
			// Drop PK - constraint name is typically tablename_pkey
			pkName := tableName + "_pkey"
			query := fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT IF EXISTS %q", quotedTable, pkName)
			if _, err := db.Pool.Exec(ctx, query); err != nil {
				return fmt.Errorf("drop primary key: %w", err)
			}
		} else if !cur.PrimaryKey && col.PrimaryKey {
			query := fmt.Sprintf("ALTER TABLE %s ADD PRIMARY KEY (%q)", quotedTable, col.Name)
			if _, err := db.Pool.Exec(ctx, query); err != nil {
				return fmt.Errorf("add primary key: %w", err)
			}
		}

		// Foreign key
		curRef := cur.References
		newRef := col.References
		curRefStr := ""
		curWasMultiple := false
		if curRef != nil {
			curRefStr = curRef.Table + "." + curRef.Column
			curWasMultiple = curRef.Multiple
		}
		newRefStr := ""
		if newRef != nil {
			if !isValidIdentifier(newRef.Table) || !isValidIdentifier(newRef.Column) {
				return fmt.Errorf("invalid foreign key reference: %s.%s", newRef.Table, newRef.Column)
			}
			newRefStr = newRef.Table + "." + newRef.Column
		}

		// Single -> multiple: drop FK, change type to array, add comment
		if newRef != nil && newRef.Multiple && !curWasMultiple {
			// Drop existing FK constraint if present
			var fkName string
			err := db.Pool.QueryRow(ctx, `
				SELECT tc.constraint_name FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
				WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = $2
			`, tableName, col.Name).Scan(&fkName)
			if err == nil {
				if _, err := db.Pool.Exec(ctx, fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT %q", quotedTable, fkName)); err != nil {
					return fmt.Errorf("drop foreign key: %w", err)
				}
			}
			refType, _ := getReferencedColumnDataType(ctx, newRef.Table, newRef.Column)
			arrayType := refTypeToArrayType(refType)
			// Convert column to array: integer -> integer[] using array[col]
			query := fmt.Sprintf("ALTER TABLE %s ALTER COLUMN %q TYPE %s USING array[%q]", quotedTable, col.Name, arrayType, col.Name)
			if _, err := db.Pool.Exec(ctx, query); err != nil {
				return fmt.Errorf("alter column to array: %w", err)
			}
			comment := fmt.Sprintf("ref:%s:%s:multiple", newRef.Table, newRef.Column)
			if _, err := db.Pool.Exec(ctx, fmt.Sprintf("COMMENT ON COLUMN %s.%q IS %s", quotedTable, col.Name, quoteLiteral(comment))); err != nil {
				return fmt.Errorf("set column comment: %w", err)
			}
			if err := ensureManyRefJoinTable(ctx, tableName, col.Name, newRef); err != nil {
				return err
			}
			if err := backfillManyRefJoinTableFromArray(ctx, tableName, col.Name, newRef); err != nil {
				return err
			}
			continue
		}

		if curRefStr != "" && curRefStr != newRefStr {
			// Drop existing FK - look up constraint name
			var fkName string
			err := db.Pool.QueryRow(ctx, `
				SELECT tc.constraint_name FROM information_schema.table_constraints tc
				JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
				WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = $2
			`, tableName, col.Name).Scan(&fkName)
			if err == nil {
				query := fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT %q", quotedTable, fkName)
				if _, err := db.Pool.Exec(ctx, query); err != nil {
					return fmt.Errorf("drop foreign key: %w", err)
				}
			}
		}
		if curWasMultiple && (newRef == nil || !newRef.Multiple || curRefStr != newRefStr) {
			if err := dropManyRefJoinTable(ctx, tableName, col.Name); err != nil {
				return err
			}
		}
		if newRef != nil && newRef.Multiple {
			if err := ensureManyRefJoinTable(ctx, tableName, col.Name, newRef); err != nil {
				return err
			}
			if err := backfillManyRefJoinTableFromArray(ctx, tableName, col.Name, newRef); err != nil {
				return err
			}
		}
		if newRefStr != "" && curRefStr != newRefStr && newRef != nil && !newRef.Multiple {
			if err := checkReferencedColumnIsUnique(ctx, newRef.Table, newRef.Column); err != nil {
				return err
			}
			fkName := fmt.Sprintf("fk_%s_%s", tableName, col.Name)
			query := fmt.Sprintf("ALTER TABLE %s ADD CONSTRAINT %q FOREIGN KEY (%q) REFERENCES %q (%q)",
				quotedTable, fkName, col.Name, newRef.Table, newRef.Column)
			if _, err := db.Pool.Exec(ctx, query); err != nil {
				return fmt.Errorf("add foreign key: %w", err)
			}
		}
	}

	return nil
}

// DropTable drops a table.
func DropTable(ctx context.Context, tableName string) error {
	if !db.Configured() {
		return fmt.Errorf("database not configured")
	}
	if !isValidIdentifier(tableName) {
		return fmt.Errorf("invalid table name")
	}
	schema, err := GetTableSchema(ctx, tableName)
	if err == nil {
		for _, c := range schema.Columns {
			if c.References != nil && c.References.Multiple {
				if err := dropManyRefJoinTable(ctx, tableName, c.Name); err != nil {
					return err
				}
			}
		}
	}

	query := fmt.Sprintf("DROP TABLE IF EXISTS %q", tableName)
	_, err = db.Pool.Exec(ctx, query)
	if err != nil {
		return fmt.Errorf("drop table: %w", err)
	}
	return nil
}

// CreateTable creates a table with the given columns.
func CreateTable(ctx context.Context, req *model.CreateTableRequest) error {
	if !db.Configured() {
		return fmt.Errorf("database not configured")
	}
	if req.Name == "" || len(req.Columns) == 0 {
		return fmt.Errorf("table name and at least one column required")
	}
	if !isValidIdentifier(req.Name) {
		return fmt.Errorf("invalid table name")
	}

	var parts []string
	var arrayRefComments []struct{ col, comment string }
	var manyRefs []struct {
		col string
		ref *model.ForeignKeyRef
	}
	for _, col := range req.Columns {
		if col.Name == "" {
			return fmt.Errorf("column name required")
		}
		if !isValidIdentifier(col.Name) {
			return fmt.Errorf("invalid column name: %s", col.Name)
		}
		if col.References != nil {
			if !isValidIdentifier(col.References.Table) || !isValidIdentifier(col.References.Column) {
				return fmt.Errorf("invalid foreign key reference: %s.%s", col.References.Table, col.References.Column)
			}
			if err := checkReferencedColumnIsUnique(ctx, col.References.Table, col.References.Column); err != nil {
				return err
			}
		}
		var dt string
		if col.References != nil && col.References.Multiple {
			refType, _ := getReferencedColumnDataType(ctx, col.References.Table, col.References.Column)
			dt = refTypeToArrayType(refType)
			arrayRefComments = append(arrayRefComments, struct{ col, comment string }{
				col.Name,
				fmt.Sprintf("ref:%s:%s:multiple", col.References.Table, col.References.Column),
			})
			manyRefs = append(manyRefs, struct {
				col string
				ref *model.ForeignKeyRef
			}{col: col.Name, ref: col.References})
		} else {
			dt = normalizeDataType(col.DataType, col.AutoIncrement)
		}
		spec := fmt.Sprintf("%q %s", col.Name, dt)
		if col.Required {
			spec += " NOT NULL"
		}
		if col.PrimaryKey {
			spec += " PRIMARY KEY"
		}
		if col.References != nil && !col.References.Multiple {
			spec += fmt.Sprintf(" REFERENCES %q (%q)", col.References.Table, col.References.Column)
		}
		parts = append(parts, spec)
	}

	query := fmt.Sprintf("CREATE TABLE %q (%s)", req.Name, strings.Join(parts, ", "))
	_, err := db.Pool.Exec(ctx, query)
	if err != nil {
		return fmt.Errorf("create table: %w", err)
	}
	for _, ac := range arrayRefComments {
		_, err = db.Pool.Exec(ctx, fmt.Sprintf("COMMENT ON COLUMN %q.%q IS %s", req.Name, ac.col, quoteLiteral(ac.comment)))
		if err != nil {
			return fmt.Errorf("set column comment: %w", err)
		}
	}
	for _, mr := range manyRefs {
		if err := ensureManyRefJoinTable(ctx, req.Name, mr.col, mr.ref); err != nil {
			return err
		}
	}
	return nil
}

func quoteLiteral(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// normalizeArrayValue converts JSON array values to Go slices for PostgreSQL array columns.
func normalizeArrayValue(v any, col model.ColumnInfo) any {
	// Treat as array if References.Multiple or if data type is array (e.g. integer[])
	isArrayCol := (col.References != nil && col.References.Multiple) || strings.Contains(col.DataType, "[]")
	if !isArrayCol {
		return v
	}
	sl, ok := v.([]any)
	if !ok {
		if v == nil {
			return nil
		}
		return v
	}
	// Map to []int64 for integer/bigint arrays (most common for FK)
	dt := strings.ToLower(col.DataType)
	if strings.Contains(dt, "int") || strings.Contains(dt, "bigint") {
		out := make([]int64, 0, len(sl))
		for _, x := range sl {
			switch n := x.(type) {
			case float64:
				out = append(out, int64(n))
			case int:
				out = append(out, int64(n))
			case int64:
				out = append(out, n)
			case string:
				parsed, _ := strconv.ParseInt(n, 10, 64)
				out = append(out, parsed)
			}
		}
		return out
	}
	if strings.Contains(dt, "uuid") {
		out := make([]string, 0, len(sl))
		for _, x := range sl {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return sl
}

// ExecuteQuery runs arbitrary SQL and returns columns/rows for SELECT or rowsAffected for DML/DDL.
func ExecuteQuery(ctx context.Context, sql string) (columns []string, rows [][]any, rowsAffected int, err error) {
	if !db.Configured() {
		return nil, nil, 0, fmt.Errorf("database not configured")
	}
	sql = strings.TrimSpace(sql)
	if sql == "" {
		return nil, nil, 0, fmt.Errorf("sql required")
	}

	// Use Query for statements that might return rows
	rowsResult, qErr := db.Pool.Query(ctx, sql)
	if qErr != nil {
		return nil, nil, 0, fmt.Errorf("execute query: %w", qErr)
	}
	defer rowsResult.Close()

	fds := rowsResult.FieldDescriptions()
	colNames := make([]string, len(fds))
	for i, fd := range fds {
		colNames[i] = string(fd.Name)
	}

	var result [][]any
	for rowsResult.Next() {
		vals, err := rowsResult.Values()
		if err != nil {
			return nil, nil, 0, fmt.Errorf("scan row: %w", err)
		}
		result = append(result, vals)
	}
	if err := rowsResult.Err(); err != nil {
		return nil, nil, 0, err
	}

	// If we got columns, it was a SELECT-like query
	if len(colNames) > 0 {
		return colNames, result, 0, nil
	}

	// Otherwise it was DML/DDL - get command tag for rows affected
	tag := rowsResult.CommandTag()
	rowsAffected = int(tag.RowsAffected())
	return nil, nil, rowsAffected, nil
}

// getReferencedColumnDataType returns the PostgreSQL type of the referenced column (e.g. integer, bigint, uuid).
func getReferencedColumnDataType(ctx context.Context, tableName, columnName string) (string, error) {
	var typeName string
	err := db.Pool.QueryRow(ctx, `
		SELECT format_type(a.atttypid, a.atttypmod)
		FROM pg_attribute a
		JOIN pg_class c ON a.attrelid = c.oid
		JOIN pg_namespace n ON c.relnamespace = n.oid
		WHERE n.nspname = 'public' AND c.relname = $1 AND a.attname = $2 AND a.attnum > 0 AND NOT a.attisdropped
	`, tableName, columnName).Scan(&typeName)
	if err != nil {
		return "integer", nil // default to integer
	}
	return typeName, nil
}

// refTypeToArrayType maps a referenced column type to its array form.
func refTypeToArrayType(refType string) string {
	refType = strings.ToLower(strings.TrimSpace(refType))
	switch {
	case refType == "uuid":
		return "uuid[]"
	case refType == "bigint" || strings.HasPrefix(refType, "int8"):
		return "bigint[]"
	case refType == "integer" || refType == "int" || strings.HasPrefix(refType, "int4"):
		return "integer[]"
	case refType == "smallint" || strings.HasPrefix(refType, "int2"):
		return "smallint[]"
	default:
		return "integer[]"
	}
}

// parseRefComment parses "ref:table:column" or "ref:table:column:multiple" from column comment.
// Format "ref:tags:id:multiple" splits to [tags, id, multiple] (3 parts).
func parseRefComment(comment string) *model.ForeignKeyRef {
	comment = strings.TrimSpace(comment)
	if !strings.HasPrefix(comment, "ref:") {
		return nil
	}
	parts := strings.Split(strings.TrimPrefix(comment, "ref:"), ":")
	if len(parts) < 2 {
		return nil
	}
	table, column := parts[0], parts[1]
	if !isValidIdentifier(table) || !isValidIdentifier(column) {
		return nil
	}
	ref := &model.ForeignKeyRef{Table: table, Column: column}
	// "ref:table:column:multiple" -> parts[2]=="multiple"
	if len(parts) >= 3 && strings.ToLower(parts[2]) == "multiple" {
		ref.Multiple = true
	}
	return ref
}

func isValidIdentifier(s string) bool {
	if s == "" || len(s) > 63 {
		return false
	}
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_') {
			return false
		}
	}
	return true
}

// checkReferencedColumnIsUnique verifies that the referenced column has a PRIMARY KEY or UNIQUE
// constraint. PostgreSQL requires this for foreign key references.
func checkReferencedColumnIsUnique(ctx context.Context, tableName, columnName string) error {
	var exists int
	err := db.Pool.QueryRow(ctx, `
		SELECT 1 FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND kcu.column_name = $2
			AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
		LIMIT 1
	`, tableName, columnName).Scan(&exists)
	if errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("referenced column %s.%s must have a PRIMARY KEY or UNIQUE constraint; add a primary key to the %s table first", tableName, columnName, tableName)
	}
	if err != nil {
		return fmt.Errorf("check referenced column: %w", err)
	}
	return nil
}

func normalizeDataType(dt string, autoIncrement bool) string {
	dt = strings.TrimSpace(strings.ToLower(dt))
	if autoIncrement {
		switch dt {
		case "integer", "int":
			return "serial"
		case "bigint":
			return "bigserial"
		case "smallint":
			return "smallserial"
		default:
			return "serial"
		}
	}
	switch dt {
	case "text", "varchar", "integer", "int", "bigint", "boolean", "bool",
		"timestamp", "timestamptz", "date", "numeric", "uuid", "jsonb":
		return dt
	case "character varying":
		return "varchar(255)"
	case "timestamp with time zone":
		return "timestamptz"
	case "timestamp without time zone":
		return "timestamp"
	case "":
		return "text"
	default:
		if strings.HasPrefix(dt, "varchar(") && strings.HasSuffix(dt, ")") {
			return dt
		}
		return "text"
	}
}

func manyRefJoinTableName(ownerTable, ownerColumn string) string {
	base := "__bench_m2m_" + ownerTable + "_" + ownerColumn
	if len(base) <= 63 {
		return base
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(base))
	suffix := fmt.Sprintf("_%x", h.Sum32())
	maxPrefix := 63 - len(suffix)
	if maxPrefix < 1 {
		return "__bench_m2m" + suffix
	}
	return base[:maxPrefix] + suffix
}

func getSinglePrimaryKeyColumn(ctx context.Context, tableName string) (string, error) {
	rows, err := db.Pool.Query(ctx, `
		SELECT kcu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
		ORDER BY kcu.ordinal_position
	`, tableName)
	if err != nil {
		return "", fmt.Errorf("get primary key: %w", err)
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var col string
		if err := rows.Scan(&col); err != nil {
			return "", fmt.Errorf("scan primary key: %w", err)
		}
		cols = append(cols, col)
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("read primary key: %w", err)
	}
	if len(cols) == 0 {
		return "", fmt.Errorf("table %s must have a PRIMARY KEY to use Many references", tableName)
	}
	if len(cols) > 1 {
		return "", fmt.Errorf("table %s has composite PRIMARY KEY; Many references require a single-column PRIMARY KEY", tableName)
	}
	return cols[0], nil
}

func ensureManyRefJoinTable(ctx context.Context, ownerTable, ownerColumn string, ref *model.ForeignKeyRef) error {
	if ref == nil || !ref.Multiple {
		return nil
	}
	if !isValidIdentifier(ownerTable) || !isValidIdentifier(ownerColumn) || !isValidIdentifier(ref.Table) || !isValidIdentifier(ref.Column) {
		return fmt.Errorf("invalid identifiers for many reference join table")
	}
	if err := checkReferencedColumnIsUnique(ctx, ref.Table, ref.Column); err != nil {
		return err
	}
	ownerPK, err := getSinglePrimaryKeyColumn(ctx, ownerTable)
	if err != nil {
		return err
	}
	ownerType, _ := getReferencedColumnDataType(ctx, ownerTable, ownerPK)
	refType, _ := getReferencedColumnDataType(ctx, ref.Table, ref.Column)
	joinTable := manyRefJoinTableName(ownerTable, ownerColumn)
	query := fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS %q (
			owner_value %s NOT NULL REFERENCES %q (%q) ON DELETE CASCADE,
			ref_value %s NOT NULL REFERENCES %q (%q) ON DELETE CASCADE
		)
	`, joinTable, ownerType, ownerTable, ownerPK, refType, ref.Table, ref.Column)
	if _, err := db.Pool.Exec(ctx, query); err != nil {
		return fmt.Errorf("create many reference join table: %w", err)
	}
	if err := ensureManyRefJoinTablePrimaryKey(ctx, joinTable); err != nil {
		return err
	}
	return nil
}

func ensureManyRefJoinTablePrimaryKey(ctx context.Context, joinTable string) error {
	// The canonical key for join rows is the (owner_value, ref_value) pair.
	var hasExpectedPK bool
	err := db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM pg_constraint c
			JOIN pg_class t ON t.oid = c.conrelid
			JOIN pg_namespace n ON n.oid = t.relnamespace
			WHERE n.nspname = 'public'
				AND t.relname = $1
				AND c.contype = 'p'
				AND (
					SELECT array_agg(a.attname ORDER BY x.ordinality)
					FROM unnest(c.conkey) WITH ORDINALITY AS x(attnum, ordinality)
					JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
				) = ARRAY['owner_value', 'ref_value']::text[]
		)
	`, joinTable).Scan(&hasExpectedPK)
	if err != nil {
		return fmt.Errorf("check join table primary key: %w", err)
	}
	if hasExpectedPK {
		return nil
	}

	var hasAnyPK bool
	err = db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM pg_constraint c
			JOIN pg_class t ON t.oid = c.conrelid
			JOIN pg_namespace n ON n.oid = t.relnamespace
			WHERE n.nspname = 'public'
				AND t.relname = $1
				AND c.contype = 'p'
		)
	`, joinTable).Scan(&hasAnyPK)
	if err != nil {
		return fmt.Errorf("check existing join table primary key: %w", err)
	}
	if hasAnyPK {
		return fmt.Errorf("join table %s has an unexpected PRIMARY KEY; expected (owner_value, ref_value)", joinTable)
	}

	_, err = db.Pool.Exec(ctx, fmt.Sprintf("ALTER TABLE %q ADD PRIMARY KEY (owner_value, ref_value)", joinTable))
	if err != nil {
		return fmt.Errorf("add join table primary key: %w", err)
	}
	return nil
}

func dropManyRefJoinTable(ctx context.Context, ownerTable, ownerColumn string) error {
	joinTable := manyRefJoinTableName(ownerTable, ownerColumn)
	if _, err := db.Pool.Exec(ctx, fmt.Sprintf("DROP TABLE IF EXISTS %q", joinTable)); err != nil {
		return fmt.Errorf("drop many reference join table: %w", err)
	}
	return nil
}

func selectOwnerValuesByWhere(ctx context.Context, tableName, ownerPK string, where map[string]any, validCols map[string]model.ColumnInfo) ([]any, error) {
	if len(where) == 0 {
		return nil, fmt.Errorf("where must have at least one column")
	}
	var parts []string
	var vals []any
	argNum := 1
	for k, v := range where {
		col, ok := validCols[k]
		if !ok {
			return nil, fmt.Errorf("unknown column: %s", k)
		}
		if v == nil {
			parts = append(parts, fmt.Sprintf("%q IS NULL", k))
			continue
		}
		parts = append(parts, fmt.Sprintf("%q = $%d", k, argNum))
		vals = append(vals, normalizeArrayValue(v, col))
		argNum++
	}
	query := fmt.Sprintf("SELECT %q FROM %q WHERE %s", ownerPK, tableName, strings.Join(parts, " AND "))
	rows, err := db.Pool.Query(ctx, query, vals...)
	if err != nil {
		return nil, fmt.Errorf("select owner values: %w", err)
	}
	defer rows.Close()
	var out []any
	for rows.Next() {
		var v any
		if err := rows.Scan(&v); err != nil {
			return nil, fmt.Errorf("scan owner value: %w", err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read owner values: %w", err)
	}
	return out, nil
}

func normalizeManyRefValues(raw any, refType string) []any {
	if raw == nil {
		return nil
	}
	var items []any
	switch v := raw.(type) {
	case []any:
		items = v
	case []string:
		for _, x := range v {
			items = append(items, x)
		}
	case []int:
		for _, x := range v {
			items = append(items, x)
		}
	case []int64:
		for _, x := range v {
			items = append(items, x)
		}
	case []float64:
		for _, x := range v {
			items = append(items, x)
		}
	default:
		return nil
	}
	refType = strings.ToLower(refType)
	out := make([]any, 0, len(items))
	for _, x := range items {
		switch v := x.(type) {
		case nil:
			continue
		case int64:
			out = append(out, v)
		case int:
			out = append(out, int64(v))
		case float64:
			if strings.Contains(refType, "int") || strings.Contains(refType, "serial") {
				out = append(out, int64(v))
			} else {
				out = append(out, v)
			}
		case string:
			if strings.Contains(refType, "int") || strings.Contains(refType, "serial") {
				if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
					out = append(out, parsed)
					continue
				}
			}
			out = append(out, v)
		default:
			out = append(out, v)
		}
	}
	return out
}

func syncManyRefJoinRows(ctx context.Context, ownerTable, ownerColumn string, ref *model.ForeignKeyRef, ownerValue any, raw any) error {
	if ref == nil || !ref.Multiple {
		return nil
	}
	if err := ensureManyRefJoinTable(ctx, ownerTable, ownerColumn, ref); err != nil {
		return err
	}
	joinTable := manyRefJoinTableName(ownerTable, ownerColumn)
	if _, err := db.Pool.Exec(ctx, fmt.Sprintf("DELETE FROM %q WHERE owner_value = $1", joinTable), ownerValue); err != nil {
		return fmt.Errorf("sync many references (delete): %w", err)
	}
	refType, _ := getReferencedColumnDataType(ctx, ref.Table, ref.Column)
	values := normalizeManyRefValues(raw, refType)
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{})
	for _, rv := range values {
		key := fmt.Sprintf("%v", rv)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		if _, err := db.Pool.Exec(
			ctx,
			fmt.Sprintf("INSERT INTO %q (owner_value, ref_value) VALUES ($1, $2)", joinTable),
			ownerValue,
			rv,
		); err != nil {
			return fmt.Errorf("sync many references (insert): %w", err)
		}
	}
	return nil
}

func backfillManyRefJoinTableFromArray(ctx context.Context, ownerTable, ownerColumn string, ref *model.ForeignKeyRef) error {
	if ref == nil || !ref.Multiple {
		return nil
	}
	if err := ensureManyRefJoinTable(ctx, ownerTable, ownerColumn, ref); err != nil {
		return err
	}
	ownerPK, err := getSinglePrimaryKeyColumn(ctx, ownerTable)
	if err != nil {
		return err
	}
	query := fmt.Sprintf("SELECT %q, %q FROM %q", ownerPK, ownerColumn, ownerTable)
	rows, err := db.Pool.Query(ctx, query)
	if err != nil {
		return fmt.Errorf("backfill many references: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var ownerVal any
		var raw any
		if err := rows.Scan(&ownerVal, &raw); err != nil {
			return fmt.Errorf("backfill many references scan: %w", err)
		}
		if err := syncManyRefJoinRows(ctx, ownerTable, ownerColumn, ref, ownerVal, raw); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("backfill many references rows: %w", err)
	}
	return nil
}
