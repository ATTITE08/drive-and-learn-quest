import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { levelLabel, subjectLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/results")({
  component: Results,
});

function Results() {
  const { data: roleData } = useUserRole();
  const isStaff = roleData?.role === "admin" || roleData?.role === "formateur";

  const { data, isLoading } = useQuery({
    queryKey: ["results", roleData?.userId, isStaff],
    enabled: !!roleData?.userId,
    queryFn: async () => {
      let q = supabase
        .from("attempts")
        .select("id,score,total,duration_seconds,finished_at,created_at,user_id,quizzes(title,subject,level),profiles!attempts_user_id_fkey(full_name,email)")
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false });
      if (!isStaff) q = q.eq("user_id", roleData!.userId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">{isStaff ? "Résultats des agents" : "Mes résultats"}</h1>
        <p className="text-muted-foreground">Historique des tests passés.</p>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {isStaff && <TableHead>Agent</TableHead>}
              <TableHead>Questionnaire</TableHead>
              <TableHead>Matière</TableHead>
              <TableHead>Niveau</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Chargement…</TableCell></TableRow>
            ) : !data?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aucun résultat pour le moment.</TableCell></TableRow>
            ) : data.map((r: any) => {
              const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
              return (
                <TableRow key={r.id}>
                  {isStaff && <TableCell><div className="font-medium">{r.profiles?.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{r.profiles?.email}</div></TableCell>}
                  <TableCell className="font-medium">{r.quizzes?.title}</TableCell>
                  <TableCell>{subjectLabel(r.quizzes?.subject)}</TableCell>
                  <TableCell>{levelLabel(r.quizzes?.level)}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn("font-bold tabular-nums", pct >= 70 ? "text-success" : pct >= 50 ? "text-amber" : "text-destructive")}>
                      {pct}%
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">({r.score}/{r.total})</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(r.finished_at).toLocaleDateString("fr-FR")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
