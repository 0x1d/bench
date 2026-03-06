/* eslint-disable react-refresh/only-export-components -- context exports provider and hook */
import { createContext, useContext, useState } from 'react';
import type { Node } from '@xyflow/react';

type TerraformCommand = 'init' | 'plan' | 'apply' | 'destroy';

export interface TfFileEntry {
  path: string;
  content: string;
}

interface InfrastructureViewContextValue {
  selectedNode: Node | null;
  setSelectedNode: (node: Node | null) => void;
  selectedFile: string | null;
  setSelectedFile: (path: string | null) => void;
  fileContent: string;
  setFileContent: (content: string) => void;
  output: string;
  setOutput: React.Dispatch<React.SetStateAction<string>>;
  outputCommand: TerraformCommand | null;
  setOutputCommand: (cmd: TerraformCommand | null) => void;
  tfFilePaths: TfFileEntry[];
  setTfFilePaths: (files: TfFileEntry[]) => void;
  tfContent: string;
  setTfContent: (content: string) => void;
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
  onRefresh: (() => void) | null;
  setOnRefresh: (cb: (() => void) | null) => void;
}

const InfrastructureViewContext = createContext<InfrastructureViewContextValue | null>(null);

export function InfrastructureViewProvider({ children }: { children: React.ReactNode }) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [output, setOutput] = useState('');
  const [outputCommand, setOutputCommand] = useState<TerraformCommand | null>(null);
  const [tfFilePaths, setTfFilePaths] = useState<TfFileEntry[]>([]);
  const [tfContent, setTfContent] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [onRefresh, setOnRefresh] = useState<(() => void) | null>(null);

  return (
    <InfrastructureViewContext.Provider
      value={{
        selectedNode,
        setSelectedNode,
        selectedFile,
        setSelectedFile,
        fileContent,
        setFileContent,
        output,
        setOutput,
        outputCommand,
        setOutputCommand,
        tfFilePaths,
        setTfFilePaths,
        tfContent,
        setTfContent,
        isRunning,
        setIsRunning,
        onRefresh,
        setOnRefresh,
      }}
    >
      {children}
    </InfrastructureViewContext.Provider>
  );
}

export function useInfrastructureView(): InfrastructureViewContextValue {
  const ctx = useContext(InfrastructureViewContext);
  if (!ctx) {
    throw new Error('useInfrastructureView must be used within InfrastructureViewProvider');
  }
  return ctx;
}
