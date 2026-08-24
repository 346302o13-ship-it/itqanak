import { FinanceStudent } from "@/components/finance-student";
import { csrfTokenForPage } from "@/lib/auth-runtime";
import { parseFinanceListQuery } from "@/lib/finance-form";
import { createFinanceRuntime } from "@/lib/finance-runtime";
import { requireStudentPagePrincipal } from "@/lib/student-page";

interface FinancePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>;
}

export const metadata = { title: "Payments & dues" };
export const dynamic = "force-dynamic";

export default async function EnglishStudentFinancePage({ searchParams }: FinancePageProps) {
  const query = await searchParams;
  const [principal, csrfToken] = await Promise.all([
    requireStudentPagePrincipal("/en/student/finance", "finance.read.own", "en"),
    csrfTokenForPage(),
  ]);
  const filters = parseFinanceListQuery(query);
  const runtime = await createFinanceRuntime();
  let dues;
  let report;
  try {
    [dues, report] = await Promise.all([
      runtime.finance.listStudentDues(principal, filters),
      runtime.finance.getStudentReport(principal),
    ]);
  } finally {
    await runtime.close();
  }
  return (
    <FinanceStudent
      csrfToken={csrfToken}
      displayName={principal.displayName}
      dues={dues}
      filters={filters}
      locale="en"
      report={report}
    />
  );
}
