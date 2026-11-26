# Channels: the channel list (Admin > Configuration > Channels)

The app's **one list** of interfaces, their consoles, the components (tiles) of each console and the features of each component. Everything that names a place in the app points at it by id: a feedback statement's subject, a Project Plan, a support chat's focal feature, a support queue (a console), and the Resources guides a Help tile shows. Because the ids never change, renaming a node renames it everywhere.

Code: `admin/channels/` (`ChannelsConsole.tsx`, `channels.scss`); the shared store `channels/channelStore.ts` and the pure helpers `channels/channelTree.ts` (`indexChannels`, `childrenOf`, `pathOf`, `labelOf`, `nearest`, `subtreeIds`, `nudged`, `movedBefore`); where each Help tile sits, `channels/helpTargets.ts`. Storage: the node tree of `resources.json` in the app's data folder (backend `storage/channels.py` and `storage/resources.py`); the API is `GET /api/channels` (the tree alone) and the Resources node routes for edits (`POST /api/resources/nodes`, `PUT .../{id}/name`, `PUT /api/resources/nodes/reorder`, `DELETE .../{id}`).

## Where the list comes from

- **The app's own screens** (`APP_SCREENS` in `storage/channels.py`): every interface (Writer, Reader, Learning, User, Helper, Admin; Learning's nodes keep its old name, Training, as `training/*`), its consoles and the tiles of each, under fixed ids built from their names (`writer/draft/draft`, `admin/office/voting`). They are put in once per version of that list: missing nodes are added after the ones already there, nothing is renamed or removed, and a branch an admin deleted is not brought back.
- **Features** are the admins' own: added under a component here.
- A tree from before the list had ids keeps its own nodes, names and guides.

## The page

`.chConsole` holds the bar (the title and **Add an interface**, a plus), a refusal note when there is one (`.chError`, `role="alert"`) and the tree (`role="tree"`, "Channels"). Each node is a row (`.chRow`), indented by depth:

- **Grip** (`GripIcon`): drag the row among its siblings (`useReorder`, the list slides open a dashed gap); **Alt+Up / Alt+Down** on the grip moves it one place.
- **Name** (a text field): saved when the field is left or on Enter; Escape puts the name back.
- **Kind** (Interface, Console, Component, Feature) in muted ink.
- **Delete** (`TrashIcon`): asks in place (a check to delete the node and everything under it, a cross to keep it). A node that feedback, a plan or a chat still points at is **not deleted**, and the note says what still uses it ("still used by 2 feedback messages").
- **Add** (a plus): adds the next kind down (a console to an interface, a component to a console, a feature to a component). A node only goes under the kind one level up; the server refuses anything else.
- **Show / hide** (a chevron, `aria-expanded`) what is under the node.

## Who reads it

- **Help tiles** find their guides by their screen's id (with the names they used before, so guides written under older nodes still show).
- **Resources** (the article and quiz builder) picks a node from the same list to write its guide; it does not edit the list.
- The Helper panel's chat links and the Queue console's queues name its nodes.

## Tokens

Surfaces `ov-sink-1` (a row under the pointer or holding focus), `ov-sink-2` (a name being typed, a button under the pointer); text `ink`, `ink-muted`; the admin accent (`accent`) for the focus ring; `alert` mixed into the refusal note's ground.

## Don't

- Don't name a place in the app by its words: point at its channel id, so a rename reaches every use.
- Don't copy the list into another store: read it from `channelStore.ts`.
- Don't delete a node something points at: the server refuses it.
