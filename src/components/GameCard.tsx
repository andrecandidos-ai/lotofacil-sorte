import { Card } from "@/components/ui/card";
import LotteryBall from "./LotteryBall";
import { checkGame, type Game } from "@/lib/lotofacil";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

interface GameCardProps {
  game: Game;
  index: number;
  result?: number[];
}

const GameCard = ({ game, index, result }: GameCardProps) => {
  const check = result ? checkGame(game, result) : null;

  const getPrizeLabel = (matches: number, total: number) => {
    if (total === 15) {
      if (matches >= 15) return "🏆 1º Prêmio";
      if (matches >= 14) return "🥈 2º Prêmio";
      if (matches >= 13) return "🥉 3º Prêmio";
      if (matches >= 12) return "4º Prêmio";
      if (matches >= 11) return "5º Prêmio";
    }
    return null;
  };

  const prize = check ? getPrizeLabel(check.matches, game.length) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
    >
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">Jogo {index + 1}</span>
          {check && (
            <div className="flex items-center gap-2">
              <Badge variant={check.matches >= 11 ? "default" : "secondary"}>
                {check.matches} acertos
              </Badge>
              {prize && <Badge className="bg-accent text-accent-foreground">{prize}</Badge>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {game.map((n, i) => (
            <LotteryBall
              key={n}
              number={n}
              delay={i}
              size="sm"
              variant={
                check
                  ? check.matched.includes(n)
                    ? "match"
                    : "miss"
                  : "default"
              }
            />
          ))}
        </div>
      </Card>
    </motion.div>
  );
};

export default GameCard;
