const STORAGE_KEY = "folderArchitectState";
const DEFAULT_THEME = "light";

const elements = {
  themeToggle: document.getElementById("themeToggle"),
  searchInput: document.getElementById("searchInput"),
  clearSearchButton: document.getElementById("clearSearchButton"),
  collapseTreeButton: document.getElementById("collapseTreeButton"),
  treeContainer: document.getElementById("treeContainer"),
  breadcrumb: document.getElementById("breadcrumb"),
  currentFolderTitle: document.getElementById("currentFolderTitle"),
  folderCount: document.getElementById("folderCount"),
  fileCount: document.getElementById("fileCount"),
  nestedCount: document.getElementById("nestedCount"),
  addFolderButton: document.getElementById("addFolderButton"),
  addFileButton: document.getElementById("addFileButton"),
  resetButton: document.getElementById("resetButton"),
  contentSummary: document.getElementById("contentSummary"),
  contentList: document.getElementById("contentList"),
  filePreview: document.getElementById("filePreview"),
  messageBanner: document.getElementById("messageBanner"),
  searchResults: document.getElementById("searchResults"),
  entryDialog: document.getElementById("entryDialog"),
  entryForm: document.getElementById("entryForm"),
  dialogModeLabel: document.getElementById("dialogModeLabel"),
  dialogTitle: document.getElementById("dialogTitle"),
  dialogHint: document.getElementById("dialogHint"),
  closeDialogButton: document.getElementById("closeDialogButton"),
  cancelDialogButton: document.getElementById("cancelDialogButton"),
  submitDialogButton: document.getElementById("submitDialogButton"),
  entryName: document.getElementById("entryName"),
  entryContent: document.getElementById("entryContent"),
  fileContentGroup: document.getElementById("fileContentGroup"),
  contentItemTemplate: document.getElementById("contentItemTemplate"),
};

const dialogState = {
  mode: "folder",
  action: "create",
  targetId: null,
  parentId: null,
};

let state = loadState();

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createFile(name, content = "") {
  return {
    id: createId("file"),
    name,
    content,
  };
}

function createFolder(name, options = {}) {
  return {
    id: options.id || createId("folder"),
    name,
    files: options.files || [],
    subfolders: options.subfolders || [],
    isExpanded: options.isExpanded ?? true,
  };
}

function createInitialState() {
  const guides = createFolder("Guides", {
    subfolders: [
      createFolder("Wireframes", {
        files: [createFile("home-screen.txt", "Sketch the main file explorer layout and interactions.")],
      }),
    ],
    files: [createFile("readme.md", "Keep this folder for project notes and planning assets.")],
  });

  const assets = createFolder("Assets", {
    files: [
      createFile("logo.txt", "Folder Architect visual direction:\n- warm neutral background\n- bold orange accents"),
      createFile("icons.txt", "Use simple emoji-style icons for folders and files."),
    ],
  });

  const root = createFolder("Root", {
    id: "root",
    subfolders: [guides, assets],
    files: [createFile("welcome.txt", "This is your browser-persisted file system. Add folders, files, and explore.")],
  });

  return {
    root,
    currentFolderId: "root",
    selectedFileId: null,
    theme: DEFAULT_THEME,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialState();
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.root?.id || !Array.isArray(parsed.root.subfolders) || !Array.isArray(parsed.root.files)) {
      return createInitialState();
    }

    return {
      root: parsed.root,
      currentFolderId: parsed.currentFolderId || parsed.root.id,
      selectedFileId: parsed.selectedFileId || null,
      theme: parsed.theme || DEFAULT_THEME,
    };
  } catch (error) {
    console.error("Failed to load saved state", error);
    return createInitialState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save state", error);
    showMessage("Could not save changes to local storage.", "error");
  }
}

function normalizeName(name) {
  return name.trim();
}

function validateEntryName(name) {
  const trimmed = normalizeName(name);
  if (!trimmed) {
    return "Name cannot be empty.";
  }

  if (/[\\/]/.test(trimmed)) {
    return "Names cannot contain slash characters.";
  }

  return "";
}

function compareByName(a, b) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function sortFolderTree(folder) {
  folder.subfolders.sort(compareByName);
  folder.files.sort(compareByName);
  folder.subfolders.forEach(sortFolderTree);
}

// Depth-first lookup keeps navigation, breadcrumbs, and mutations aligned to the same tree model.
function findFolderById(folder, id, parent = null, trail = []) {
  if (folder.id === id) {
    return { folder, parent, trail: [...trail, folder] };
  }

  for (const subfolder of folder.subfolders) {
    const result = findFolderById(subfolder, id, folder, [...trail, folder]);
    if (result) {
      return result;
    }
  }

  return null;
}

function findFileById(folder, fileId, trail = []) {
  const matchedFile = folder.files.find((file) => file.id === fileId);
  if (matchedFile) {
    return {
      file: matchedFile,
      parentFolder: folder,
      trail: [...trail, folder],
    };
  }

  for (const subfolder of folder.subfolders) {
    const result = findFileById(subfolder, fileId, [...trail, folder]);
    if (result) {
      return result;
    }
  }

  return null;
}

function ensureValidCurrentFolder() {
  const folderRecord = findFolderById(state.root, state.currentFolderId);
  if (!folderRecord) {
    state.currentFolderId = state.root.id;
    showMessage("Current folder no longer exists. Returned to Root.", "error");
  }

  if (state.selectedFileId && !findFileById(state.root, state.selectedFileId)) {
    state.selectedFileId = null;
  }
}

function hasDuplicateName(folder, candidateName, options = {}) {
  const normalized = normalizeName(candidateName).toLowerCase();

  return (
    folder.subfolders.some(
      (subfolder) => subfolder.id !== options.excludeFolderId && subfolder.name.trim().toLowerCase() === normalized,
    ) ||
    folder.files.some((file) => file.id !== options.excludeFileId && file.name.trim().toLowerCase() === normalized)
  );
}

function getCounts(folder) {
  let nestedFolders = folder.subfolders.length;
  let nestedFiles = folder.files.length;

  for (const subfolder of folder.subfolders) {
    const childCounts = getCounts(subfolder);
    nestedFolders += childCounts.nestedFolders;
    nestedFiles += childCounts.nestedFiles;
  }

  return {
    visibleFolders: folder.subfolders.length,
    visibleFiles: folder.files.length,
    nestedFolders,
    nestedFiles,
  };
}

function showMessage(message, tone = "info") {
  elements.messageBanner.textContent = message;
  elements.messageBanner.dataset.tone = tone;
  elements.messageBanner.classList.add("visible");

  clearTimeout(showMessage.timeoutId);
  showMessage.timeoutId = window.setTimeout(() => {
    elements.messageBanner.classList.remove("visible");
  }, 3200);
}

function updateTheme() {
  document.body.dataset.theme = state.theme;
  elements.themeToggle.textContent = state.theme === "dark" ? "Light Theme" : "Dark Theme";
}

function anyFolderCollapsed(folder) {
  if (folder.subfolders.length && !folder.isExpanded) {
    return true;
  }

  return folder.subfolders.some(anyFolderCollapsed);
}

function persistAndRender() {
  ensureValidCurrentFolder();
  sortFolderTree(state.root);
  saveState();
  render();
}

function openDialog(config) {
  dialogState.mode = config.mode;
  dialogState.action = config.action;
  dialogState.targetId = config.targetId || null;
  dialogState.parentId = config.parentId || state.currentFolderId;

  const isFile = config.mode === "file";
  const isRename = config.action === "rename";
  const label = isRename ? "Rename" : "Create";

  elements.dialogModeLabel.textContent = label;
  elements.dialogTitle.textContent = `${isRename ? "Rename" : "Add"} ${isFile ? "File" : "Folder"}`;
  elements.submitDialogButton.textContent = isRename ? "Apply" : "Save";
  elements.fileContentGroup.style.display = isFile && !isRename ? "block" : "none";
  elements.dialogHint.textContent = isFile
    ? "File names must be unique inside this folder. You can store any text data."
    : "Folder names must be unique inside this folder.";

  if (isRename) {
    if (isFile) {
      const fileRecord = findFileById(state.root, config.targetId);
      elements.entryName.value = fileRecord?.file.name || "";
      elements.entryContent.value = "";
    } else {
      const folderRecord = findFolderById(state.root, config.targetId);
      elements.entryName.value = folderRecord?.folder.name || "";
      elements.entryContent.value = "";
    }
  } else {
    elements.entryName.value = "";
    elements.entryContent.value = "";
  }

  elements.entryDialog.showModal();
  window.setTimeout(() => elements.entryName.focus(), 0);
}

function closeDialog() {
  if (elements.entryDialog.open) {
    elements.entryDialog.close();
  }
  elements.entryForm.reset();
}

function navigateToFolder(folderId) {
  const folderRecord = findFolderById(state.root, folderId);
  if (!folderRecord) {
    showMessage("That folder could not be opened.", "error");
    state.currentFolderId = state.root.id;
    persistAndRender();
    return;
  }

  folderRecord.trail.forEach((folder) => {
    folder.isExpanded = true;
  });
  state.currentFolderId = folderId;
  persistAndRender();
}

function handleCreateFolder(name) {
  const validationMessage = validateEntryName(name);
  if (validationMessage) {
    showMessage(validationMessage, "error");
    return false;
  }
  const folderName = normalizeName(name);

  const parentRecord = findFolderById(state.root, dialogState.parentId);
  if (!parentRecord) {
    showMessage("Cannot add a folder here.", "error");
    return false;
  }

  if (hasDuplicateName(parentRecord.folder, folderName)) {
    showMessage("A file or folder with that name already exists here.", "error");
    return false;
  }

  parentRecord.folder.subfolders.push(createFolder(folderName));
  showMessage(`Folder "${folderName}" created.`, "success");
  return true;
}

function handleCreateFile(name, content) {
  const validationMessage = validateEntryName(name);
  if (validationMessage) {
    showMessage(validationMessage, "error");
    return false;
  }
  const fileName = normalizeName(name);

  const parentRecord = findFolderById(state.root, dialogState.parentId);
  if (!parentRecord) {
    showMessage("Cannot add a file here.", "error");
    return false;
  }

  if (hasDuplicateName(parentRecord.folder, fileName)) {
    showMessage("A file or folder with that name already exists here.", "error");
    return false;
  }

  const newFile = createFile(fileName, content.trim());
  parentRecord.folder.files.push(newFile);
  state.selectedFileId = newFile.id;
  showMessage(`File "${fileName}" created.`, "success");
  return true;
}

function handleRenameFolder(folderId, newName) {
  const validationMessage = validateEntryName(newName);
  if (validationMessage) {
    showMessage(validationMessage, "error");
    return false;
  }
  const folderName = normalizeName(newName);

  const folderRecord = findFolderById(state.root, folderId);
  if (!folderRecord || !folderRecord.parent) {
    showMessage("The root folder cannot be renamed.", "error");
    return false;
  }

  if (hasDuplicateName(folderRecord.parent, folderName, { excludeFolderId: folderId })) {
    showMessage("A file or folder with that name already exists here.", "error");
    return false;
  }

  folderRecord.folder.name = folderName;
  showMessage(`Folder renamed to "${folderName}".`, "success");
  return true;
}

function handleRenameFile(fileId, newName) {
  const validationMessage = validateEntryName(newName);
  if (validationMessage) {
    showMessage(validationMessage, "error");
    return false;
  }
  const fileName = normalizeName(newName);

  const fileRecord = findFileById(state.root, fileId);
  if (!fileRecord) {
    showMessage("That file could not be found.", "error");
    return false;
  }

  if (hasDuplicateName(fileRecord.parentFolder, fileName, { excludeFileId: fileId })) {
    showMessage("A file or folder with that name already exists here.", "error");
    return false;
  }

  fileRecord.file.name = fileName;
  showMessage(`File renamed to "${fileName}".`, "success");
  return true;
}

function deleteFolder(folderId) {
  const folderRecord = findFolderById(state.root, folderId);
  if (!folderRecord || !folderRecord.parent) {
    showMessage("The root folder cannot be deleted.", "error");
    return;
  }

  const counts = getCounts(folderRecord.folder);
  const totalItems = counts.nestedFolders + counts.nestedFiles;
  const confirmed = window.confirm(
    `Delete folder "${folderRecord.folder.name}" and its ${totalItems} nested item${totalItems === 1 ? "" : "s"}?`,
  );
  if (!confirmed) {
    return;
  }

  folderRecord.parent.subfolders = folderRecord.parent.subfolders.filter((subfolder) => subfolder.id !== folderId);

  if (state.currentFolderId === folderId) {
    state.currentFolderId = folderRecord.parent.id;
  }

  const selectedFileRecord = state.selectedFileId ? findFileById(folderRecord.folder, state.selectedFileId) : null;
  if (selectedFileRecord) {
    state.selectedFileId = null;
  }

  showMessage(`Folder "${folderRecord.folder.name}" deleted.`, "success");
  persistAndRender();
}

function deleteFile(fileId) {
  const fileRecord = findFileById(state.root, fileId);
  if (!fileRecord) {
    showMessage("That file could not be found.", "error");
    return;
  }

  const confirmed = window.confirm(`Delete file "${fileRecord.file.name}"?`);
  if (!confirmed) {
    return;
  }

  fileRecord.parentFolder.files = fileRecord.parentFolder.files.filter((file) => file.id !== fileId);

  if (state.selectedFileId === fileId) {
    state.selectedFileId = null;
  }

  showMessage(`File "${fileRecord.file.name}" deleted.`, "success");
  persistAndRender();
}

function buildPathLabel(trail) {
  return trail.map((segment) => segment.name).join(" > ");
}

function searchTree(query) {
  const normalizedQuery = normalizeName(query).toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const results = [];

  // Search walks the entire tree so files and folders can be revealed from any depth.
  function walk(folder, trail = []) {
    const nextTrail = [...trail, folder];

    if (folder.name.toLowerCase().includes(normalizedQuery)) {
      results.push({
        id: folder.id,
        type: "folder",
        name: folder.name,
        pathLabel: buildPathLabel(nextTrail),
        parentId: trail[trail.length - 1]?.id || folder.id,
      });
    }

    folder.files.forEach((file) => {
      if (file.name.toLowerCase().includes(normalizedQuery)) {
        results.push({
          id: file.id,
          type: "file",
          name: file.name,
          pathLabel: buildPathLabel(nextTrail),
          parentId: folder.id,
        });
      }
    });

    folder.subfolders.forEach((subfolder) => walk(subfolder, nextTrail));
  }

  walk(state.root);

  return results.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function renderTreeNode(folder) {
  const node = document.createElement("div");
  node.className = "tree-node";

  const row = document.createElement("div");
  row.className = "tree-row";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ghost-button small-button tree-toggle";
  toggle.textContent = folder.subfolders.length ? (folder.isExpanded ? "-" : "+") : ".";
  toggle.disabled = folder.subfolders.length === 0;
  if (!toggle.disabled) {
    toggle.addEventListener("click", () => {
      folder.isExpanded = !folder.isExpanded;
      persistAndRender();
    });
  }

  const label = document.createElement("button");
  label.type = "button";
  label.className = "tree-label";
  if (folder.id === state.currentFolderId) {
    label.classList.add("active");
  }
  const kind = document.createElement("span");
  kind.className = "kind-badge";
  kind.textContent = "DIR";

  const name = document.createElement("span");
  name.textContent = folder.name;

  const meta = document.createElement("span");
  meta.className = "tree-meta";
  meta.textContent = `${folder.subfolders.length}F / ${folder.files.length}f`;

  label.append(kind, name, meta);
  label.addEventListener("click", () => navigateToFolder(folder.id));

  row.append(toggle, label);
  node.append(row);

  if (folder.subfolders.length && folder.isExpanded) {
    const children = document.createElement("div");
    children.className = "tree-children";
    folder.subfolders.forEach((subfolder) => {
      children.append(renderTreeNode(subfolder));
    });
    node.append(children);
  }

  return node;
}

function renderTree() {
  elements.treeContainer.innerHTML = "";

  const list = document.createElement("div");
  list.className = "tree-list";
  list.append(renderTreeNode(state.root));

  elements.treeContainer.append(list);
}

function renderBreadcrumb(trail) {
  elements.breadcrumb.innerHTML = "";

  trail.forEach((segment, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "breadcrumb-button";
    button.textContent = segment.name;
    button.addEventListener("click", () => navigateToFolder(segment.id));
    elements.breadcrumb.append(button);

    if (index < trail.length - 1) {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = ">";
      elements.breadcrumb.append(separator);
    }
  });
}

function createContentItem(entry, type, currentPath) {
  const fragment = elements.contentItemTemplate.content.cloneNode(true);
  const item = fragment.querySelector(".content-item");
  const nameButton = fragment.querySelector(".item-name-button");
  const openButton = fragment.querySelector(".item-open-button");
  const renameButton = fragment.querySelector(".item-rename-button");
  const deleteButton = fragment.querySelector(".item-delete-button");
  const pathLabel = fragment.querySelector(".item-path");

  const kindLabel = type === "folder" ? "DIR" : "FILE";
  nameButton.textContent = `${kindLabel} ${entry.name}`;
  pathLabel.textContent = currentPath;

  if (type === "folder") {
    nameButton.addEventListener("click", () => navigateToFolder(entry.id));
    openButton.textContent = "Open";
    openButton.addEventListener("click", () => navigateToFolder(entry.id));
    renameButton.addEventListener("click", () =>
      openDialog({ mode: "folder", action: "rename", targetId: entry.id, parentId: state.currentFolderId }),
    );
    deleteButton.addEventListener("click", () => deleteFolder(entry.id));
  } else {
    if (state.selectedFileId === entry.id) {
      nameButton.classList.add("active");
    }
    nameButton.addEventListener("click", () => {
      state.selectedFileId = entry.id;
      persistAndRender();
    });
    openButton.textContent = "View";
    openButton.addEventListener("click", () => {
      state.selectedFileId = entry.id;
      persistAndRender();
    });
    renameButton.addEventListener("click", () =>
      openDialog({ mode: "file", action: "rename", targetId: entry.id, parentId: state.currentFolderId }),
    );
    deleteButton.addEventListener("click", () => deleteFile(entry.id));
  }

  return item;
}

function renderContent(currentFolderRecord) {
  const folder = currentFolderRecord.folder;
  elements.currentFolderTitle.textContent = folder.name;

  const counts = getCounts(folder);
  elements.folderCount.textContent = String(counts.visibleFolders);
  elements.fileCount.textContent = String(counts.visibleFiles);
  elements.nestedCount.textContent = String(counts.nestedFolders + counts.nestedFiles);
  elements.contentSummary.textContent = `${counts.visibleFolders} folders and ${counts.visibleFiles} files in this directory`;

  elements.contentList.innerHTML = "";

  if (folder.subfolders.length === 0 && folder.files.length === 0) {
    elements.contentList.classList.add("empty-state");
    elements.contentList.textContent = "This folder is empty. Add a file or folder to get started.";
    return;
  }

  elements.contentList.classList.remove("empty-state");
  const currentPath = buildPathLabel(currentFolderRecord.trail);

  folder.subfolders.forEach((subfolder) => {
    elements.contentList.append(createContentItem(subfolder, "folder", currentPath));
  });

  folder.files.forEach((file) => {
    elements.contentList.append(createContentItem(file, "file", currentPath));
  });
}

function renderFilePreview() {
  if (!state.selectedFileId) {
    elements.filePreview.classList.add("empty-state");
    elements.filePreview.textContent = "Select a file to view its contents.";
    return;
  }

  const fileRecord = findFileById(state.root, state.selectedFileId);
  if (!fileRecord) {
    state.selectedFileId = null;
    elements.filePreview.classList.add("empty-state");
    elements.filePreview.textContent = "Select a file to view its contents.";
    return;
  }

  elements.filePreview.classList.remove("empty-state");
  elements.filePreview.innerHTML = "";

  const title = document.createElement("h4");
  title.className = "preview-heading";
  title.textContent = fileRecord.file.name;

  const path = document.createElement("p");
  path.className = "preview-path";
  path.textContent = buildPathLabel(fileRecord.trail);

  const content = document.createElement("pre");
  content.className = "preview-content";
  content.textContent = fileRecord.file.content || "This file exists, but it does not contain any stored data yet.";

  elements.filePreview.append(title, path, content);
}

function renderSearchResults() {
  const query = elements.searchInput.value;
  const results = searchTree(query);
  elements.searchResults.innerHTML = "";

  if (!query.trim()) {
    elements.searchResults.classList.add("empty-state");
    elements.searchResults.textContent = "Search results will appear here.";
    return;
  }

  if (results.length === 0) {
    elements.searchResults.classList.add("empty-state");
    elements.searchResults.textContent = "No files or folders matched your search.";
    return;
  }

  elements.searchResults.classList.remove("empty-state");
  const list = document.createElement("div");
  list.className = "search-results-list";

  results.forEach((result) => {
    const item = document.createElement("article");
    item.className = "search-result";

    const content = document.createElement("div");
    const title = document.createElement("button");
    title.type = "button";
    title.className = "item-name-button";
    title.textContent = `${result.type === "folder" ? "DIR" : "FILE"} ${result.name}`;

    const meta = document.createElement("p");
    meta.className = "item-path";
    meta.textContent = result.pathLabel;

    content.append(title, meta);

    const action = document.createElement("button");
    action.type = "button";
    action.className = "ghost-button small-button";
    action.textContent = result.type === "folder" ? "Open" : "Reveal";

    const handleResult = () => {
      if (result.type === "folder") {
        navigateToFolder(result.id);
      } else {
        navigateToFolder(result.parentId);
        state.selectedFileId = result.id;
        persistAndRender();
      }
    };

    title.addEventListener("click", handleResult);
    action.addEventListener("click", handleResult);

    item.append(content, action);
    list.append(item);
  });

  elements.searchResults.append(list);
}

function render() {
  updateTheme();
  ensureValidCurrentFolder();
  elements.collapseTreeButton.textContent = anyFolderCollapsed(state.root) ? "Expand All" : "Collapse All";

  const currentFolderRecord = findFolderById(state.root, state.currentFolderId);
  if (!currentFolderRecord) {
    return;
  }

  // Re-render from state after every mutation so the tree, breadcrumbs, counts, and preview stay in sync.
  renderTree();
  renderBreadcrumb(currentFolderRecord.trail);
  renderContent(currentFolderRecord);
  renderFilePreview();
  renderSearchResults();
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  persistAndRender();
}

function collapseAllFolders(folder, keepRootExpanded = true) {
  folder.isExpanded = keepRootExpanded && folder.id === state.root.id;
  folder.subfolders.forEach((subfolder) => collapseAllFolders(subfolder, false));
}

function expandAllFolders(folder) {
  folder.isExpanded = true;
  folder.subfolders.forEach(expandAllFolders);
}

elements.themeToggle.addEventListener("click", toggleTheme);

elements.searchInput.addEventListener("input", renderSearchResults);

elements.clearSearchButton.addEventListener("click", () => {
  elements.searchInput.value = "";
  renderSearchResults();
});

elements.collapseTreeButton.addEventListener("click", () => {
  const shouldCollapse = elements.collapseTreeButton.textContent === "Collapse All";

  if (shouldCollapse) {
    collapseAllFolders(state.root);
    elements.collapseTreeButton.textContent = "Expand All";
  } else {
    expandAllFolders(state.root);
    elements.collapseTreeButton.textContent = "Collapse All";
  }

  persistAndRender();
});

elements.addFolderButton.addEventListener("click", () => {
  openDialog({ mode: "folder", action: "create", parentId: state.currentFolderId });
});

elements.addFileButton.addEventListener("click", () => {
  openDialog({ mode: "file", action: "create", parentId: state.currentFolderId });
});

elements.resetButton.addEventListener("click", () => {
  state = createInitialState();
  persistAndRender();
  showMessage("Demo data restored.", "success");
});

elements.closeDialogButton.addEventListener("click", closeDialog);
elements.cancelDialogButton.addEventListener("click", closeDialog);

elements.entryDialog.addEventListener("click", (event) => {
  const bounds = elements.entryDialog.getBoundingClientRect();
  const isBackdropClick =
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom;

  if (isBackdropClick) {
    closeDialog();
  }
});

elements.entryDialog.addEventListener("cancel", () => {
  elements.entryForm.reset();
});

elements.entryForm.addEventListener("submit", (event) => {
  event.preventDefault();

  let succeeded = false;

  if (dialogState.action === "create" && dialogState.mode === "folder") {
    succeeded = handleCreateFolder(elements.entryName.value);
  }

  if (dialogState.action === "create" && dialogState.mode === "file") {
    succeeded = handleCreateFile(elements.entryName.value, elements.entryContent.value);
  }

  if (dialogState.action === "rename" && dialogState.mode === "folder") {
    succeeded = handleRenameFolder(dialogState.targetId, elements.entryName.value);
  }

  if (dialogState.action === "rename" && dialogState.mode === "file") {
    succeeded = handleRenameFile(dialogState.targetId, elements.entryName.value);
  }

  if (!succeeded) {
    return;
  }

  closeDialog();
  persistAndRender();
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    state = loadState();
    render();
    showMessage("Folder structure refreshed from storage.", "info");
  }
});

persistAndRender();
