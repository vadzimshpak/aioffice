import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Ссылки пока никуда не ведут: переход увёл бы окно приложения со страницы редактора.
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} title={href} onClick={(event) => event.preventDefault()}>
      {children}
    </a>
  ),
};

/** Просмотр Markdown с расширениями GitHub (таблицы, списки задач, зачёркивание). */
export function MarkdownPreview({ source }: { source: string }) {
  return (
    <div className="min-w-0 flex-1 overflow-auto px-8 py-6 select-text">
      <article className="prose prose-sm max-w-3xl dark:prose-invert">
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {source}
        </Markdown>
      </article>
    </div>
  );
}
