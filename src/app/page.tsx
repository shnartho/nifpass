import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <Logo size="lg" showByline />
      <h1 className="mt-10 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
        Your NIF. One scan. Done.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-ink-500">
        Customer NIF collection made simple. Open the merchant dashboard on your laptop and the customer app on your phone.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/store"
          className="group rounded-2xl border border-ink-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
        >
          <p className="text-sm font-medium text-brand-600">For merchants</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">Merchant dashboard</p>
          <p className="mt-2 text-sm text-ink-500">Show a QR code and receive customer NIFs in real time.</p>
          <p className="mt-4 text-sm font-medium text-ink-900 group-hover:text-brand-600">/store →</p>
        </Link>
        <Link
          href="/user"
          className="group rounded-2xl border border-ink-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
        >
          <p className="text-sm font-medium text-brand-600">For customers</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">NIFPass app</p>
          <p className="mt-2 text-sm text-ink-500">Scan the merchant QR and share your NIF after confirming.</p>
          <p className="mt-4 text-sm font-medium text-ink-900 group-hover:text-brand-600">/user →</p>
        </Link>
      </div>
    </main>
  );
}
