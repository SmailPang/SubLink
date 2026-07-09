import { CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/datetime";
import { cn } from "@/lib/utils";

type DateTimeInputProps = {
  value?: string | null;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
};

export function DateTimeInput({ value, onChange, id, className, disabled }: DateTimeInputProps) {
  return (
    <div className={cn("relative", className)}>
      <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type="datetime-local"
        value={toDateTimeLocalValue(value)}
        disabled={disabled}
        onChange={(event) => onChange(fromDateTimeLocalValue(event.target.value))}
        className="cursor-pointer pl-9"
      />
    </div>
  );
}
