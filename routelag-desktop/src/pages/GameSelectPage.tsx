import type { GameOption } from "../App";
import { GameRow } from "../components/GameRow";

interface GameSelectPageProps {
  games: GameOption[];
  onSelect: (game: GameOption) => void;
}

export function GameSelectPage({
  games,
  onSelect,
}: GameSelectPageProps) {
  return (
    <div className="game-view">
      <div className="rl-glow-top" />
      <div className="game-list">
        {games.map((game) => (
          <GameRow key={game.id} game={game} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
