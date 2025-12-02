import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export interface AlertDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ConfirmAlertDialogProps {
  state: AlertDialogState;
  onOpenChange: (open: boolean) => void;
}

export function ConfirmAlertDialog({ state, onOpenChange }: ConfirmAlertDialogProps) {
  return (
    <Dialog
      open={state.isOpen}
      onOpenChange={(open) => {
        if (!open) {
          if (state.onCancel) state.onCancel();
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-foreground/90 whitespace-pre-line">
            {state.description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex justify-end gap-2">
          {state.cancelText && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (state.onCancel) state.onCancel();
                onOpenChange(false);
              }}
            >
              {state.cancelText}
            </Button>
          )}
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              const cb = state.onConfirm;
              onOpenChange(false);
              if (cb) cb();
            }}
          >
            {state.confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
