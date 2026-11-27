'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { addTaskComment, listTaskComments } from '@/lib/data-service';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ROLE_LABELS, type Profile, type TaskComment } from '@/types/database';

interface TaskCommentsSectionProps {
  taskId: string;
  initialComments: TaskComment[];
  currentUser: Profile;
  isDeleted: boolean;
}

export function TaskCommentsSection({
  taskId,
  initialComments,
  currentUser,
  isDeleted,
}: TaskCommentsSectionProps) {
  const channelUid = useId();
  const [extraComments, setExtraComments] = useState<TaskComment[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const comments = useMemo(() => {
    const map = new Map<string, TaskComment>();
    for (const c of initialComments) map.set(c.id, c);
    for (const c of extraComments) {
      if (c.task_id === taskId) map.set(c.id, c);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
  }, [initialComments, extraComments, taskId]);

  // Suscripción en tiempo real a comentarios nuevos de este parte
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`task-comments:${taskId}:${channelUid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_comments',
          filter: `task_id=eq.${taskId}`,
        },
        () => {
          void listTaskComments(taskId).then(setExtraComments);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [taskId, channelUid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = body.trim();
    if (!clean) return;
    setSending(true);
    setError(null);
    try {
      const created = await addTaskComment(taskId, clean, currentUser);
      setBody('');
      setExtraComments((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created]
      );
      setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el comentario.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          <MessageSquare size={16} className="text-magenta" /> Chat Interno del Parte (
          {comments.length})
        </h2>
        <span className="text-[11px] font-semibold text-mid-grey">Tiempo real</span>
      </div>

      {comments.length === 0 ? (
        <p className="text-xs text-mid-grey py-2">
          Sin mensajes internos todavía. Usa este hilo para coordinarte con el equipo sin salir del parte.
        </p>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {comments.map((c) => {
            const isOwn = c.author_id === currentUser.id;
            return (
              <div
                key={c.id}
                className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[78%] px-3.5 py-2.5 rounded-md text-xs leading-relaxed ${
                    isOwn
                      ? 'bg-navy text-white rounded-br-none'
                      : 'bg-off-white text-charcoal border border-border rounded-bl-none'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`font-bold ${
                        isOwn ? 'text-white' : 'text-navy'
                      }`}
                    >
                      {c.author?.full_name || 'Usuario'}
                    </span>
                    {c.author?.role && (
                      <span
                        className={`text-[10px] uppercase font-semibold ${
                          isOwn ? 'text-white/70' : 'text-mid-grey'
                        }`}
                      >
                        {ROLE_LABELS[c.author.role]}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                  <p
                    className={`text-[10px] mt-1 text-right ${
                      isOwn ? 'text-white/65' : 'text-mid-grey'
                    }`}
                  >
                    {new Date(c.created_at).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={listEndRef} />
        </div>
      )}

      {error && (
        <p className="text-xs font-semibold text-danger bg-danger/10 p-2.5 border-l-4 border-danger">
          {error}
        </p>
      )}

      {!isDeleted && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe un mensaje interno para el equipo..."
            maxLength={2000}
            className="flex-1 px-3 py-2.5 bg-bg-input border border-border text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
          />
          <Button type="submit" size="sm" isLoading={sending} disabled={!body.trim()}>
            <Send size={14} /> Enviar
          </Button>
        </form>
      )}
    </div>
  );
}
