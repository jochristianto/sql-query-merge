import SqlMergeTool from "@/components/sql-merge-tool"

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground text-balance">SQL Prepared Statement Merger</h1>
        <p className="text-muted-foreground mt-1">
          Paste a SQL query with {"'?'"} placeholders and a JSON array of parameters to merge them into a runnable SQL
          statement.
        </p>
      </header>
      <SqlMergeTool />
    </main>
  )
}
