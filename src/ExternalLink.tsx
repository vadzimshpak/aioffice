import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { FaArrowUpRightFromSquare } from "react-icons/fa6";

import { api } from "./api";
import { cx } from "./cx";

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

/** Ссылка, которая открывается в браузере системы, а не внутри окна приложения. */
export function ExternalLink({ href, className, children, ...rest }: Props) {
  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    api.openUrl(href).catch((err) => console.error(`не удалось открыть ${href}:`, err));
  };

  return (
    <a
      href={href}
      onClick={open}
      className={cx("inline-flex items-center gap-1 text-accent hover:underline", className)}
      {...rest}
    >
      {children}
      <FaArrowUpRightFromSquare size={10} />
    </a>
  );
}
