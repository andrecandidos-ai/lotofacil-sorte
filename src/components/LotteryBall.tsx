import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface LotteryBallProps {
  number: number;
  variant?: "default" | "match" | "miss" | "result";
  size?: "sm" | "md";
  delay?: number;
}

const LotteryBall = ({ number, variant = "default", size = "md", delay = 0 }: LotteryBallProps) => {
  const sizeClasses = size === "sm" ? "w-9 h-9 text-sm" : "w-11 h-11 text-base";

  const variantClasses = {
    default: "bg-primary text-primary-foreground",
    match: "bg-ball-match text-ball-foreground ring-2 ring-ball-match/30",
    miss: "bg-ball-miss text-ball-foreground",
    result: "bg-accent text-accent-foreground font-bold",
  };

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: delay * 0.03, type: "spring", stiffness: 400, damping: 20 }}
      className={cn(
        "rounded-full flex items-center justify-center font-semibold shadow-md select-none",
        sizeClasses,
        variantClasses[variant]
      )}
    >
      {String(number).padStart(2, "0")}
    </motion.div>
  );
};

export default LotteryBall;
