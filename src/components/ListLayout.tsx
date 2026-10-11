"use client";

import type { ReactNode } from "react";
import { store, useOtto } from "@/lib/store";
import { TaskEditor } from "./TaskEditor";
import { useTask } from "./usePulse";
import { IconClose } from "./Icons";

/** Middle list plus, on desktop, the right pane with the selected task edited inline. */
export function ListLayout({ header, children }: { header: ReactNode; children: ReactNode }) {
  const selectedId = useOtto((s) => s.selectedId);
  const task = useTask(selectedId);
  return (
    <div className="md:grid md:min-h-dvh md:grid-cols-[minmax(0,1fr)_400px]">
      <div className="safe-top mx-auto w-full max-w-3xl px-4 pt-4 pb-8 sm:px-6 md:px-8 md:pt-6">
        {header}
        {children}
      </div>
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-l border-line bg-panel md:block" aria-label="Task detail">
        {task ? (
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-medium text-muted">Task</p>
              <button type="button" aria-label="Close" className="grid size-10 place-items-center rounded-full text-muted hoverable" onClick={() => store.set({ selectedId: null })}>
                <IconClose size={18} />
              </button>
            </div>
            <TaskEditor key={task.id} task={task} onClose={() => store.set({ selectedId: null })} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-[15px] text-muted">
            <p>Pick a task to see and change its details. J and K move, E edits.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">{title}</h1>
      {children}
    </div>
  );
}
