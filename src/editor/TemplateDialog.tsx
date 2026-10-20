import { Button } from "../Button";
import { cx } from "../cx";
import { Modal } from "../Modal";
import { iconForExtension } from "./fileIcons";
import { FILE_TEMPLATES, type FileTemplate } from "./templates";

interface Props {
  open: boolean;
  /** Выбранный шаблон или null, если окно закрыли без выбора. */
  onPick: (template: FileTemplate | null) => void;
}

/** Модальное окно выбора шаблона нового файла. */
export function TemplateDialog({ open, onPick }: Props) {
  return (
    <Modal open={open} onClose={() => onPick(null)} className="w-115">
      <h2 className="mb-4 text-base font-bold">Новый файл</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {FILE_TEMPLATES.map((template) => {
          const { icon: Icon, color } = iconForExtension(template.extension);
          return (
            <Button
              key={template.title}
              className="flex flex-col items-center gap-1 px-2 py-3.5 text-center"
              onClick={() => onPick(template)}
            >
              <Icon size={30} className={cx("mb-1", color)} />
              <span className="font-semibold">{template.title}</span>
              <span className="text-[11px] text-muted">{template.description}</span>
            </Button>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end">
        <Button className="h-9 px-4" onClick={() => onPick(null)}>
          Отмена
        </Button>
      </div>
    </Modal>
  );
}
