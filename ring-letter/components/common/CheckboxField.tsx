/** A checkbox with its label text beside it (the global `.check` row). */
export default function CheckboxField({
  children,
  ...input
}: { children: React.ReactNode } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="check">
      <input type="checkbox" {...input} />
      {children}
    </label>
  );
}
