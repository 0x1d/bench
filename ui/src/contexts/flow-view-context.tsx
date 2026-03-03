/* eslint-disable react-refresh/only-export-components -- context exports provider and hook */
import { createContext, useContext, useState } from 'react';
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
}

const FlowViewContext = createContext<FlowViewContextValue | null>(null);

export function FlowViewProvider({ children }: { children: React.ReactNode }) {
  const [selectedStep, setSelectedStep] = useState<FlowStep | null>(null);
  const [onStepSave, setOnStepSave] = useState<OnStepSave | null>(null);
  const [onDeleteStep, setOnDeleteStep] = useState<OnDeleteStep | null>(null);

  return (
    <FlowViewContext.Provider
      value={{
        selectedStep,
        setSelectedStep,
        onStepSave,
        setOnStepSave,
        onDeleteStep,
        setOnDeleteStep,
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
