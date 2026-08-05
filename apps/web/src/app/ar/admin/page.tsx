import { BrandMark, StatusChip, Surface } from "@itqanak/ui";

export const metadata = { title: "لوحة الإدارة" };

export default function AdminPlaceholderPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-12">
      <Surface className="w-full text-center">
        <div className="mx-auto mb-6 w-fit">
          <BrandMark label="إتقانك" />
        </div>
        <StatusChip tone="warning">غير متاحة بعد</StatusChip>
        <h1 className="mt-5 text-3xl font-black">لوحة إدارة إتقانك</h1>
        <p className="mx-auto mt-4 max-w-xl leading-8 text-[var(--itq-color-muted)]">
          هذه صفحة مؤقتة فقط. لم تُفعّل المصادقة أو حسابات الإدارة في المرحلة الأولى، ولا تمنح
          الصفحة أي وصول إلى بيانات أو عمليات المنصة.
        </p>
      </Surface>
    </main>
  );
}
