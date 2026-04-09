import Link from "next/link";

export default function SidebarNavItem({
  icon: Icon,
  label,
  href,
  active = false,
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
        active
          ? "bg-white/10 text-white border border-white/10"
          : "text-white/60 hover:text-white hover:bg-white/5"
      }`}
    >
      <Icon size={18} />
      <span>{label}</span>
    </Link>
  );
}
