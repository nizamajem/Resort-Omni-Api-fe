export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500">Ringkasan metrik utama untuk resort.</p>
      </div>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card title="Total Bookings" value="0" subtitle="7 hari terakhir" />
        <Card title="Revenue" value="Rp 0" subtitle="bulan ini" />
        <Card title="Pending Payments" value="0" subtitle="menunggu konfirmasi" />
      </section>
      <section className="rounded border p-4">
        <h2 className="font-medium mb-2">Aktivitas Terbaru</h2>
        <p className="text-sm text-gray-500">Belum ada data untuk ditampilkan.</p>
      </section>
    </div>
  );
}

function Card({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded border p-4 bg-white">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {subtitle ? <div className="text-xs text-gray-500">{subtitle}</div> : null}
    </div>
  );
}
