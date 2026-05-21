# vs-crm — UX Enhancements

Quality-of-life and workflow improvements collected from user feedback. These
are separate from the structural TODO list in [`TODO.md`](./TODO.md) — items
here are mostly UI + small schema additions.

---

## Client detail (`/clients/:id`)

- [ ] **Inline "New project" button** in the linked-projects section of the
      client detail page. Should open the existing project-create form
      pre-filled with this client (`projects.client_id` already set, focus
      jumps to the name field). Saves a round-trip through `/projects` →
      pick-client dropdown.
- [ ] **Invoice list polish** in the client's invoices section:
  - Per-row **Download** button (reuse the jsPDF helper from `Invoices.svelte`).
  - **Paid/Unpaid/Cancelled badge** next to each invoice (chip styled like
    the status badges on `/invoices`).
  - **Quick status menu** on each row: "Mark paid", "Mark unpaid",
    "Cancel invoice". `Mark unpaid` is important — without it, a misclicked
    "paid" is unrecoverable without going to the invoice editor.

---

## Leads (`/leads`)

- [ ] **Pick-from-existing-client** mode when creating a lead. Today the lead
      form re-types name/email/phone/company. Add a dropdown at the top: pick
      an existing client → auto-fill all matching fields (read-only or
      overrideable; default read-only with an "edit" toggle). Keep manual
      entry as the fallback for leads who aren't clients yet.
  - Schema implication: leads probably need a nullable `client_id` FK if it
    doesn't exist already, so picking a client links the row (and changes to
    the client's contact info propagate).
- [ ] **Lead detail page** at `/leads/:id`. Same layout as `ClientDetail.svelte`:
      header card with primary fields, timeline of activity, **notes** area
      (probably reusing `communication_logs` filtered to the lead, or a new
      `lead_notes` table). Lets the user track what's happened — calls,
      proposals sent, follow-up dates — without dumping everything into the
      kanban card.

---

## Project detail (`/projects/:id`)

- [ ] **Inline task management** on the project detail page:
  - List the project's tasks with status / priority / due date.
  - **Edit task in place** (status dropdown, priority dropdown, due date
    inline edit) — same controls as the Tasks list.
  - **Add new task** form with `project_id` pre-filled.
  - Surface each task's **category** (see Tasks enhancements below).

---

## Tasks (`/tasks` + new `/tasks/:id`)

- [ ] **Task categories**: each task can belong to a category (e.g. "Design",
      "Dev", "Admin"). Implementation choice:
  - Lightweight: add a free-form `category TEXT` column on `tasks` + a
    chip-input UI that autocompletes from existing values.
  - OR: dedicated `task_categories` table with FK from `tasks.category_id`,
    user-managed list in Settings. More work, cleaner data model.
- [ ] **Subtasks**: each task can have child tasks. Add `parent_task_id UUID
    REFERENCES tasks(id) ON DELETE CASCADE` to the `tasks` table; UI shows
      indented child rows under the parent on the list, full tree on detail.
- [ ] **Task detail page** at `/tasks/:id`. Click a task in the list (or a
      kanban card) to open a detail view that exposes:
  - **Subtasks** — add, complete, reorder.
  - **Category** — set / change via dropdown or chip input.
  - **Client + Project** linkage — currently tasks link only to project;
    client should be derivable via `project.client_id`, but allow setting
    project (and therefore client) from the detail view, plus a direct
    "client" pin for tasks that aren't tied to a specific project.
  - **Notes / comments** (optional follow-up — share schema with leads if
    we add `lead_notes`).

---

## Cross-cutting / schema

Migrations these will need (rough sketch — exact ordering TBD when work
starts):

- `0009_task_categories.sql` — adds `tasks.category TEXT` or
  `task_categories` table + `tasks.category_id`.
- `0010_task_subtasks.sql` — adds `tasks.parent_task_id UUID REFERENCES
public.tasks(id) ON DELETE CASCADE` + an index for tree queries.
- `0011_leads_client_link.sql` — adds `leads.client_id UUID REFERENCES
public.clients(id) ON DELETE SET NULL` if not already present.
- Possibly `0012_lead_notes.sql` if we go with a dedicated notes table
  rather than reusing `communication_logs`.

All new tables/columns get RLS scoped to `auth.uid() = user_id` like the
rest of the schema.

---

## Priority hint

Rough order of impact for the user (highest first):

1. Invoice download + status toggle on client detail (recoverability — high-frequency action).
2. Inline "New project" on client detail (fewer clicks for the most common flow).
3. Subtasks + task detail page (unblocks deeper project work).
4. Pick-from-client lead creation (cleans up duplicate data entry).
5. Lead detail page with notes (good but lower urgency).
6. Task categories (nice-to-have once subtasks land).
