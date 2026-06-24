import type { GameOption } from "../App";

interface GameRowProps {
  game: GameOption;
  onSelect: (game: GameOption) => void;
}

export function GameRow({ game, onSelect }: GameRowProps) {
  return (
    <button type="button" className="game-row" onClick={() => onSelect(game)}>
      <span className="game-thumb">
        <img src={game.image} alt="" />
      </span>
      <span className="game-name">{game.name}</span>
      <span className="arrow-button" aria-hidden="true" />
    </button>
  );
}
