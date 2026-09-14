# GENERAL -----------------------------------
A writing app and webapp that helps users organize and write books.
## Code Stack 
- JS
- SCSS
- Vite
- React + Typescript
- Node + Express
- React Native

# FRONT-END ----------------------------------


### Style Guide
The app and webapp share a singular, responsive interface with a simple, material, and customizable style. 
The app will be designed cross-platform for desktops, laptops, tablets, and eventually phones, and the webapp will be responsive to all screensizes. 
> Inspiration: typical imagery connected to libraries and studies (bookshelves, bulletin boards, desks, books, folder, pages, etc.)
### Structure
The front-end structure follows this hierarchy:
- Pages are defined by user type. 
- Consoles are contained interfaces and dashboards that resolve specific actions in a page.
- Components are major features of a console.
- Bulleted items represent features, functions, and qualities of components.

The screen is divided into four general areas which are stacked in three overlapping layers. Header occupies the top layer, mainscreen and sidebar occupy the middle layer, and base occupies the bottom layer. 
#### Header
- contains UUI
- fixed position at the top of the screen
- 100vw width, 60px height
#### Sidebar
- contains HUI and AUI (Admin Page)
- user defines left or right side fixed position
- Width: persistent 40px divider, plus AUI's and/or HUI's own panel (each an independently-toggled column) when open
- Height: 100vh - 60px (for header height)
#### Mainscreen
- contains RUI, TUI, and WUI
- opposite side of sidebar
- Height: 100vh - 60px (for header height)
- Width: shrinks by however much of the Sidebar's variable width (divider + open panels) is currently showing
#### Base
- contains VUI
- opposite side of sidebar
- Height: 100vh - 60px (for header height)
- Width: inactive sidebar (100vw - 40px), active sidebar (100vw - 1 column)
### Functionality

##  Page
###  Console
####  Component
- Feature/Function/Icon
#### Settings Component
#### Help Component


## Visitor Page (VUI)
logged out users and unregistered visitors with interest in the app

### Welcome Console
landing page
#### Reader Services Component
- Reader Subscription Info:
- Reader Training Curriculum:
- Preview Library Catalog: 
- Preview Bookclub Tool: 
- Preview Reading Tool:
- Service Reviews: 
#### Writer Services Component
- Writer Subscription Info:
- Writer Training Curriculum:
- Preview Project Tool:
- Preview Plotting Tool:
- Preview Outline Tool:
- Preview Drafting Tool:
- Preview Translator Tool:
- Preview Revision Tool:
- Service Reviews: 

### Registration Console
#### Reader Registration
#### Writer Registration
#### Subscription Payment
#### Account Creation

### Login Console
#### Account Details
#### Password
#### Passkey
#### Forgotten Account
#### Forgotten Password

## User Page (UUI)
existing users when logged in
user interface as the page that houses the user schedule across all roles, notifications across all roles, learning resources for reading and writing, requests across all roles


### Dashboard Console
displays todays activity log, 
#### Activity Log Component
#### Schedule Component
#### Notifications Component
#### Settings Component
#### Help Component



### Account Console
manage user account details.
Customization: color scheme (theme, accent, alert)
#### Profile Component
#### Subscription Component
#### Portfolio Component
#### Settings Component
#### Help Component



### Training Console
#### User Training Component
#### Reader Training Component
#### Translator Training Component
#### Writer Training Component
#### Admin Training Component
#### Settings Component
#### Help Component





## Reader Page (RUI)
existing users with active reader subscriptions


### Nook Console (RUI)
#### Dashboard Component
#### Bookclub Component
#### Reading Stack Component
#### Journal Component
- Review: published and working draft reviews
- Notes: responses, reactions, and revisions on books

### Library Console (RUI)
#### Browse Component
#### Filter Component
#### Search Component
#### Series Component
#### Book Component

### Book Console (RUI)
title, description, cover, summary, reviews, tags/flags

### Pages Console (RUI)
An e-reader tool to read purchased, saved, or borrowed books

## Translator Page (TUI)


## Writer Page (WUI)
writer interface available to writer users. this interface has "bookshelves" that functions as a writer dashboard, each "shelf" is a project json file with book spine links that open book outlines

Navigation shell: three stacked layers instead of a flat clickable switcher --
bookContainer (book/chapter editing, bottom), bookshelfContainer (project
shelf + a hidden shelfConsole drawer for the selected project, middle), and
wuiSidebar (four per-level panels -- Projects/Shelf/Book/Chapter -- topmost,
always 1 column wide). wuiSidebar is the *only* place navigation happens --
each panel is a horizontally-scrolling shelf of book-spine buttons (the
bookshelf/spine visual lives only here now), letting you step one level at
a time through the outline (project -> root -> book -> arc -> chapter ->
act/scene/moment). The main screen (bookContainer/bookshelfContainer) is a
pure editor for whichever single node is currently focused -- no picking,
no children list there. Selecting a chapter from the sidebar "opens the
book" (an animated transition) into that chapter's draft; toggling to a
reader/review view (also from the sidebar) "flips a page" into its
preview. The Plot tree (reached via the Shelf console's "Project Plot" tab)
is the one exception -- its own category/subcategory/plotline navigation
stays self-contained in its own editor, since those are all edited at the
project/shelf level rather than needing a deep drill-down the sidebar is
shaped around.

### Shelves Console (WUI)
view all projects, edit master template
writer dashboard for all projects (schedule, notifications, requests, resources)
#### Project Template Component
#### Schedule Component
task checklist, routine checklist, 
#### Analytics Component
#### Scratchpad Component
Simple note/markdown editor for random thoughts that eases conversion of note items into outline, plot, draft, and revision objects.

#### Shelves Settings Component
#### Shelves Help Component


### Shelf Console (WUI)
manage project details and configuration, plotline and plot categorization
manage one project, plot categories and subcategories, plotlines, unassigned plotpoints, and timeline view of assigned plotpoints

#### Project Editor Component
- Summary:
- Description: 
#### Project Analytics Component
#### Project Schedule Component
- Goals: 
- Routines: 
- Checklists: organized tasks
- Revisions: 
#### Project History Component
preserves and condenses version and activity information


#### Project Plot Component
Container component for navigating plot elements.
#### Plot Template Component
#### Plot Category Component
Plot categories are a general class of topics and concepts within the narrative. 
Preset categories are managed by admin users, and they include characters, settings, themes, diction, and more. 
Preset categories include prefabricated child templates for subcategories and plotlines. 
Custom categories can be defined by a title, a short description, keywords/keyphrases, 
and form templates for child subcategories and plotlines. 
Child templates define custom fields in the creator form for subcategories and plotlines within that category. 
Plot Subcategories are a specific class of topics and concepts within the narrative. 
Custom subcategories can be defined by a title, a short description, keywords/keyphrases, and templates for child plotlines. 
Child templates define custom fields in the creator form for plotlines within that subcategory, as well as the parent category templates for those plotlines. 
- View plot categories and subcategories.
- Create plot categories and subcategories.
- Edit plot categories and subcategories (*title, description, custom fields, plotline templates, subcategory templates*).
- Delete plot categories and subcategories (*orphaned plotlines get assigned to an "unassigned" category or subcategory*).
- Use preset plot categories to pre-build plotline structures (*characters, settings, themes, style*)
#### Plotline Component
Plotlines are specific topics and concepts that are connected along a unified timeline. 
Some plotlines examples include: symbols in the theme category, individuals in the character category, locations in the setting category, etc. 


#### Project Outline Component
manage project outline; books, chapters, and are the required levels, 
but the hierarchy of all possible levels are series, books, arcs, chapters, acts, scenes, moments
#### Outline Template Component
manage book templates
#### Series Outline Component
parent container for included books
#### Book Outline Component
summarized, at-a-glance cards containing book details and progress

#### Shelf Settings Component
#### Shelf Help Component



### Book Console (WUI)
manage outline

#### Outline Template Component
manage chapter templates
#### Book Editor Component
- View and edit book details (*design, title, description, summary, goals*)
- 
#### Arc Outline Component
#### Chapter Outline Component
#### Act Outline Component
#### Scene Outline Component
#### Moment Outline Component
#### Book Settings Component
#### Book Help Component



### Page Console (WUI)
manage draft
chapter level interface displaying a read only version of the chapter outline (acts, scenes, moments); chapter outline with draft input components


#### Bookmark Component
A single column sidebar that houses mostly read-only information on all parent objects.
Only one collapsible can 
- Projects Outline: single column, read-only, collapsible dashboard 
- Project Outline: single column, read-only, collapsible project outline
- Book Outline: single column, read-only, collapsible book outline
- Chapter Outline: single column, read-only, collapsible chapter outline

#### Paragraph Component
#### Sentence Component
#### Chapter Outline Component
#### Page Settings Component
#### Page Help Component



### Pages Console (WUI)
view preview and export
chapter level interface with the formatted version of the chapter draft w/ optional annotations; 
#### Bookmark Component
A single column sidebar that houses read-only information on all parent objects.
- Projects Outline: single column, read-only, collapsible dashboard 
- Project Outline: single column, read-only, collapsible project outline
- Book Outline: single column, read-only, collapsible book outline
- Chapter Outline: single column, read-only, collapsible chapter outline
#### Reaction Component
Two 20px columns in the lefthand margins used to indicate the emotional reaction to the preview copy. 
React by clicking a sentence, and selecting like and/or dislike. 
Clicking once defines the level 1 value for the selected indicator (+/-).
Clicking twice defines the level 2 value for the selected indicator (++/--).
Clicking thrice defines the level 2 value for the selected indicator (+++/---).
Clicking four times resets the indicator to inactive.
Dragging the indicator downward indicates the length of the reaction at a continuous level. 
- Love (+++)
- Adore (++)
- Like (+)
- Dislike (-)
- Loath (--)
- Hate (---)
#### Flag Component
- Add
- Remove
- Merge
- Change
- Simplify
- Expand
#### Export Component
export project/book/chapter content into a downloadable file (json, epub, pdf, doc)
- JSON
- EPUB
- PDF
- DOC
#### Pages Settings Component
preferences, customization, and configuration for this console
#### Pages Help Component
resources and assistance using features in this console



## Helper Sidebar Page (HUI)
optional secondary console to assist other users in the app

The sidebar divider's icon column also carries the Admin entry point -- it's not one of the HUI consoles itself, it just lives in the same icon column since that's where the Admin icon was moved from the top nav. Clicking it opens AUI (the Admin Page, below) as its own slide-out panel on the Sidebar's outermost edge (the true screen edge, outside the divider), independently of whether HUI's own panel is open.


### Settings Console
work management
#### Workweek Component
#### Workday Component
#### Schedule Settings Component
#### Schedule Help Component

### Queue Console
view of all assigned/active console queues
#### Page Component
#### Queue Component
- 1 queue per console
#### Queue Toggle/Meter Component
- 150px height, 30px wide
- Meter segments: 5px height per person in queue segments up to 30 people, then segments are proportionate to percentages
- Meter segment color code: light accent for open chats with standard users, dark accent for open chats with admin users, light alert for pending chats with standard users in active queues, dark alert for pending chats with admin users in active queues, light theme for pending chats with standard users in inactive queues, dark theme for pending chats with admin users in inactive queues
#### Queue Settings Component
#### Queue Help Component

### Chat Console
interaction management
#### User Component
view user details
#### Conversation Component
#### Help Tool Component
#### Chat Settings Component
#### Chat Help Component

### Inbox Console
Console that manages assigned feedback for processing. 
There are 3 processing components:
#### Toning Component
annotate if the message in the feedback has a pleasant or unpleasant tone
#### Sorting Component
annotate what pages, components, features, and/or functions are being discussed
#### Explicating Component
annotate the intended actions for each feature
#### Inbox Settings Component
#### Inbox Help Component

### Dispatch Console
helper management
#### Performance Component
#### Department Component
- Helpers active/idle/inactive in the department
#### Queue Component
- Helpers active/idle/inactive in the queue.
#### Dispatch Settings Component
#### Dispatch Help Component

## Admin Page (AUI)
Interfaces dedicated to work in admin roles. Lives in the Sidebar as its own slide-out panel (outermost edge, opened via the divider's Admin icon -- see Helper Sidebar Page above), not as a Mainscreen page; the console/component list below is unaffected by where it's mounted.

### Dashboard Console
#### Notifications Component
#### Schedule Component

### Processor Console
task/case management 
#### Voting Component
- Approve and/or deny explicated, toned, and sorted feedback
- Admin-defined order to processing tones and feature sorting
#### Processor Help Component

### Organizer Console
#### Channel Management
- review processed feedback
- second processing
#### Bookclub Management

### Manager Console
team and user management
#### Allotment Component
#### Assignment Component
#### Team Schedule Component
#### Manager Help Component

### Director Console
department management
#### Department Details Component
#### Department Roster Component
- Manage Roles: promote/demote/skill admin users based on training, assign full and part time schedules
- 
#### Department Analytics Component
#### Department Component

### Office Console
Admin management
- Monitor Training: 
- Department Schedules: 
- Hire/Term Admin: 

### Configuration Console
system management (functionality) -- currently an empty placeholder; the
Console/Component/Feature outline editor originally drafted here turned
out to be informational reference content rather than actual site
settings, so it moved to its own Resources console below.
#### Overview Component
#### Configuration Help Component

### Resources Console
documentation/help, trainings, resources -- each component below mounts
the same persisted, editable Console -> Component -> Feature outline
(admin-config.json), toggleable between an edit view and a read-only view
#### Project Plan Component
#### Visitor Configuration Component
- Welcome
- Registration
- Login
#### User Configuration Component
- Dashboard
- Account
- Training
#### Reader Configuration Component
- Nook
- Library
- Book
- Pages
#### Translator Configuration Component
- 
#### Writer Configuration Component
- Shelves
- Shelf
- Book
- Page
- Pages
#### Helper Configuration Component
- Schedule
- Chat
- Inbox
- Queue
- Dispatch
#### Admin Configuration Component
- Dashboard
- Processor
- Organizer
- Manager
- Director
- Office
#### Resources Help Component




# BACK-END -----------------------------------
The app and webapp share a general file architecture.

## System JSON File

## User JSON File

## Toolkit JSON File
Admin-managed, prebuilt templates provided to active subscribers

## Project JSON File
per-project file
### Project Details Object
### Plot Object
Root nodes are a general plot category for orphaned plotlines and plotpoints.
### Outline Object
Root nodes that are required in every project are book, chapter, and moment. Arcs, acts, and scenes are optional.
### Draft Object
### Revision Object
### Export Object

