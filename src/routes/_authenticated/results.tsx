import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { levelLabel, subjectLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AttemptDetail } from "@/components/AttemptDetail";

export const Route = createFileRoute("/_authenticated/results")({
  head: () => ({ meta: [{ title: "Résultats — RailFormation" }] }),
  component: Results,
});

function Results() {
  const { data: roleData } = useUserRole();
  const [open, setOpen] = useState<string | null>(null);
  const isStaff = roleData?.role === "admin" || roleData?.role === "formateur";

  const { data, isLoading } = useQuery({
    queryKey: ["results", roleData?.userId, isStaff],
    enabled: !!roleData?.userId,
    queryFn: async () => {
      let q = supabase
        .from("attempts")
        .select("id,score,total,duration_seconds,finished_at,created_at,user_id,quizzes(title,subject,level)")
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false });
      if (!isStaff) q = q.eq("user_id", roleData!.userId);
      const { data: attempts, error } = await q;
      if (error) throw error;
      const rows = attempts ?? [];
      if (!isStaff || rows.length === 0) {
        return rows.map((r: any) => ({ ...r, profiles: null }));
      }
      const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return rows.map((r: any) => ({ ...r, profiles: byId.get(r.user_id) ?? null }));
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
              const isOpen = open === r.id;
              return (
                <Fragment key={r.id}>
                <TableRow className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.id)}>
                  {isStaff && <TableCell><div className="font-medium">{r.profiles?.full_name ?? "—"}</div><div className="text-xs text-muted-foreground">{r.profiles?.email}</div></TableCell>}
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1">
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                      {r.quizzes?.title}
                    </span>
                  </TableCell>
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
                {isOpen && (
                  <TableRow>
                    <TableCell colSpan={isStaff ? 6 : 5} className="bg-muted/20">
                      <AttemptDetail attemptId={r.id} />
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
