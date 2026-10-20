import { FaScroll } from "react-icons/fa6";

import { Button } from "../../Button";

/** Кнопка перехода к логам — рассуждениям и действиям агентов. */
export function LogsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button className="flex h-9 items-center gap-2 px-3" onClick={onClick}>
      <FaScroll /> Логи
    </Button>
  );
}
