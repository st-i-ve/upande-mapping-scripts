"use client";

import { AlertTriangle, HelpCircle } from "lucide-react";
import { useConfirm, answerConfirm } from "@/lib/confirm";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Shows whatever askConfirm() is asking. Mounted once, in the app shell. */
export function ConfirmHost() {
  const req = useConfirm((s) => s.request);
  const danger = req?.danger !== false;
  return (
    <Dialog open={req !== null} onOpenChange={(o) => { if (!o) answerConfirm(false); }}>
      <DialogContent className="max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${danger ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
              {danger ? <AlertTriangle size={15} /> : <HelpCircle size={15} />}
            </span>
            <div className="min-w-0 space-y-1.5 pt-0.5">
              <DialogTitle className="text-[13px] font-semibold leading-snug">{req?.title}</DialogTitle>
              {req?.message && (
                <DialogDescription className="whitespace-pre-line text-[11px] leading-relaxed">{req.message}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="secondary" size="sm" onClick={() => answerConfirm(false)}>{req?.cancelLabel ?? "Cancel"}</Button>
          <Button variant={danger ? "destructive" : "default"} size="sm" autoFocus onClick={() => answerConfirm(true)}>
            {req?.confirmLabel ?? (danger ? "Delete" : "OK")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
