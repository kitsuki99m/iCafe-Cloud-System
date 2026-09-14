-- Close any active billing pause when a Cloud session reaches an ended state.
-- This is a final cleanup backstop only. Admin session-close preparation is
-- local/non-billing and must never create a server-side pause before commit.

create or replace function public.aezakmi_close_pause_when_session_ends()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.status='active' and new.status='ended' then
    update public.branch_session_pauses
       set resumed_at=coalesce(new.ended_at,new.updated_at,now())
     where branch_id=new.branch_id
       and computer_session_id=new.local_id
       and resumed_at is null;
  end if;
  return new;
end$$;

revoke all on function public.aezakmi_close_pause_when_session_ends() from public,anon,authenticated;
grant execute on function public.aezakmi_close_pause_when_session_ends() to service_role;

drop trigger if exists branch_session_close_active_pause on public.branch_sessions;
create trigger branch_session_close_active_pause
after update of status on public.branch_sessions
for each row
when (old.status is distinct from new.status)
execute function public.aezakmi_close_pause_when_session_ends();
