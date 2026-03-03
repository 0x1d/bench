/* eslint-disable react-refresh/only-export-components -- context exports provider and hook */
import { createContext, useCallback, useContext, useState } from 'react';
import type { FlowStep } from '@/services/api';

export type OnStepSave = (step: FlowStep) => void;
export type OnDeleteStep = (stepId: string) => void;

interface FlowViewContextValue {
  selectedStep: FlowStep | null;
  setSelectedStep: (step: FlowStep | null) => void;
  onStepSave: OnStepSave | null;
  setOnStepSave: (cb: OnStepSave | null) => void;
  onDeleteStep: OnDeleteStep | null;
  setOnDeleteStep: (cb: OnDeleteStep | null) => void;
  executionId: string | null;
  setExecutionId: (id: string | null) => void;
  flowWorkspace: string | null;
  flowModule: string | null;
  setFlowContext: (workspace: string | null, module: string | null) => void;
}

const FlowViewContext = createContext<FlowViewContextValue | null>(null);

export function FlowViewProvider({ children }: { children: React.ReactNode }) {
  const [selectedStep, setSelectedStep] = useState<FlowStep | null>(null);
  const [onStepSave, setOnStepSave] = useState<OnStepSave | null>(null);
  const [onDeleteStep, setOnDeleteStep] = useState<OnDeleteStep | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [flowWorkspace, setFlowWorkspace] = useState<string | null>(null);
  const [flowModule, setFlowModule] = useState<string | null>(null);

  const setFlowContext = useCallback((workspace: string | null, module: string | null) => {
    setFlowWorkspace(workspace);
    setFlowModule(module ?? null);
  }, []);

  return (
    <FlowViewContext.Provider
      value={{
        selectedStep,
        setSelectedStep,
        onStepSave,
        setOnStepSave,
        onDeleteStep,
        setOnDeleteStep,
        executionId,
        setExecutionId,
        flowWorkspace,
        flowModule,
        setFlowContext,
      }}
    >
      {children}
    </FlowViewContext.Provider>
  );
}

export function useFlowView(): FlowViewContextValue {
  const ctx = useContext(FlowViewContext);
  if (!ctx) {
    throw new Error('useFlowView must be used within FlowViewProvider');
  }
  return ctx;
}
