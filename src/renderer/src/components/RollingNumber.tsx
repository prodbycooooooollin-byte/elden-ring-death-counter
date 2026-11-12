import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * A number whose digits roll when they change. Digits are fixed-width slots counted from the
 * right, so 9 → 10 adds a slot on the left and nothing else shifts.
 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const digits = String(Math.max(0, value)).split("");
  return (
    <span className={cn("numerals inline-flex overflow-hidden leading-none", className)} aria-label={String(value)}>
      {digits.map((digit, index) => {
        const place = digits.length - index; // stable key per decimal place
        return (
          <span key={place} className="relative inline-block w-[0.5em] text-center" aria-hidden>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={digit}
                className="inline-block"
                initial={{ y: "70%", opacity: 0, filter: "blur(6px)" }}
                animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-70%", opacity: 0, filter: "blur(6px)" }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
              >
                {digit}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}
