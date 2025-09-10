"use client";

type PackageDetailProps = {
  title?: string;
  price?: number;
  description?: string;
};

export default function PackageDetail({ title = "Paket", price = 0, description = "Deskripsi paket." }: PackageDetailProps) {
  return (
    <section className="rounded border p-4 space-y-2">
      <h2 className="text-xl font-medium">{title}</h2>
      <p className="text-gray-600">{description}</p>
      <div className="font-semibold">Rp {price.toLocaleString("id-ID")}</div>
    </section>
  );
}

