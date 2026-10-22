let allCommands = [];
let activeCommand = "analyze-javascript-application";
let currentCategory = "ALL";

const commandListEl = document.getElementById("commandList");
const commandSearchEl = document.getElementById("commandSearch");
const categoryChipsEl = document.getElementById("categoryChips");
const activeCommandTitleEl = document.getElementById("activeCommandTitle");
const activeCommandDescEl = document.getElementById("activeCommandDesc");
const formInputsEl = document.getElementById("formInputs");
const btnExecuteEl = document.getElementById("btnExecute");
const consoleOutputEl = document.getElementById("consoleOutput");
const executionBadgeEl = document.getElementById("executionBadge");
const btnCopyResultEl = document.getElementById("btnCopyResult");
const btnClearConsoleEl = document.getElementById("btnClearConsole");
const dropzoneEl = document.getElementById("dropzone");
const btnDoctorEl = document.getElementById("btnDoctor");
const btnHelpEl = document.getElementById("btnHelp");

// Initialize catalog
async function init() {
  try {
    const res = await fetch("/api/catalog");
    allCommands = await res.json();
    renderCommandList();
    selectCommand("analyze-javascript-application");
  } catch (err) {
    console.error("Failed to load catalog:", err);
    consoleOutputEl.textContent =
      "Failed to connect to backend bridge. Is the server running? " +
      err.message;
  }
}

// Render commands in sidebar
function renderCommandList() {
  const query = commandSearchEl.value.toLowerCase().trim();
  commandListEl.innerHTML = "";

  const filtered = allCommands.filter((item) => {
    const matchesCat =
      currentCategory === "ALL" || item.category === currentCategory;
    const matchesQuery =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query);
    return matchesCat && matchesQuery;
  });

  filtered.forEach((item) => {
    const el = document.createElement("div");
    el.className = `command-item ${item.name === activeCommand ? "active" : ""}`;
    el.innerHTML = `
      <div class="command-name">${item.name}</div>
      <div class="command-category-tag">${item.category}</div>
    `;
    el.addEventListener("click", () => selectCommand(item.name));
    commandListEl.appendChild(el);
  });
}

// Select and load command details
async function selectCommand(cmdName) {
  activeCommand = cmdName;
  activeCommandTitleEl.textContent = cmdName;
  activeCommandDescEl.textContent = "Loading schema and help details...";

  // Update sidebar active highlight
  document.querySelectorAll(".command-item").forEach((el) => {
    const isThis = el.querySelector(".command-name")?.textContent === cmdName;
    el.classList.toggle("active", isThis);
  });

  // Fetch schema / parameters
  try {
    const res = await fetch(`/api/schema?cmd=${encodeURIComponent(cmdName)}`);
    const data = await res.json();

    // Parse description from help text or fallback
    let desc = `Execute REA command: ${cmdName}`;
    if (data.helpText) {
      const lines = data.helpText
        .split("\n")
        .filter((l) => l.trim().length > 0);
      if (lines.length > 1) {
        desc = lines[1].trim();
      }
    }
    activeCommandDescEl.textContent = desc;
    renderFormInputs(cmdName, data.schemaRaw, data.helpText);
  } catch (err) {
    activeCommandDescEl.textContent = "Manual parameter configuration";
    renderFormInputs(cmdName, null, null);
  }
}

// Render dynamic input fields based on command schema
function renderFormInputs(cmdName, schemaRaw, helpText) {
  formInputsEl.innerHTML = "";

  const primaryField = document.createElement("div");
  primaryField.className = "form-group";

  let label = "Target Path (Binary / APK / Folder / ASAR)";
  let placeholder = "C:/path/to/binary.exe or app";

  if (cmdName.includes("search") && !cmdName.includes("android")) {
    label = "Search Query / String";
    placeholder = "e.g. password, auth, crypto";
  } else if (cmdName === "read-bytes" || cmdName === "instructions") {
    label = "Memory / Function Address";
    placeholder = "e.g. 0x140001000";
  }

  primaryField.innerHTML = `
    <label class="form-label">${label}</label>
    <input type="text" id="primaryInput" class="form-input" placeholder="${placeholder}">
  `;
  formInputsEl.appendChild(primaryField);

  // If command requires a secondary positional argument like 'decompile', 'function', or 'inspect-with-objdump'
  if (
    cmdName === "decompile" ||
    cmdName === "function" ||
    cmdName === "xrefs"
  ) {
    const secField = document.createElement("div");
    secField.className = "form-group";
    secField.innerHTML = `
      <label class="form-label">Procedure / Function Name or Address (Optional)</label>
      <input type="text" id="secondaryInput" class="form-input" placeholder="e.g. main, CheckPassword, 0x140001000">
    `;
    formInputsEl.appendChild(secField);
  } else if (cmdName === "inspect-with-objdump") {
    const secField = document.createElement("div");
    secField.className = "form-group";
    secField.innerHTML = `
      <label class="form-label">Operation (Required)</label>
      <select id="secondaryInput" class="form-input">
        <option value="file_headers">file_headers (Summary & Arch)</option>
        <option value="section_headers">section_headers (Sections & Memory layout)</option>
        <option value="symbols">symbols (Exported & Imported symbols)</option>
        <option value="disassemble">disassemble (Instructions)</option>
        <option value="relocations">relocations</option>
      </select>
    `;
    formInputsEl.appendChild(secField);
  }

  // Additional options field
  const optionsField = document.createElement("div");
  optionsField.className = "form-group";
  optionsField.innerHTML = `
    <label class="form-label">Extra Flags / Options (Optional)</label>
    <input type="text" id="extraArgsInput" class="form-input" placeholder="e.g. --provider auto">
  `;
  formInputsEl.appendChild(optionsField);
}

// Execute active command
async function executeCommand() {
  const primaryVal = document.getElementById("primaryInput")?.value.trim();
  const secondaryVal = document.getElementById("secondaryInput")?.value.trim();
  const extraVal = document.getElementById("extraArgsInput")?.value.trim();

  // Validate required target
  const needsTarget = ![
    "doctor",
    "capabilities",
    "providers",
    "list-cutter-sessions",
    "list-adb-devices",
  ].includes(activeCommand);
  if (needsTarget && !primaryVal) {
    alert(
      `Please specify the Target Path for ${activeCommand}! You can drop a file or click 'Browse System Files'.`,
    );
    document.getElementById("primaryInput")?.focus();
    return;
  }

  const args = [];
  if (primaryVal) args.push(primaryVal);
  if (secondaryVal) args.push(secondaryVal);

  const flags = { json: true };
  if (extraVal) {
    const parts = extraVal.split(/\s+/);
    parts.forEach((p) => {
      if (p.startsWith("--")) {
        const flagName = p.substring(2);
        flags[flagName] = true;
      } else {
        args.push(p);
      }
    });
  }

  executionBadgeEl.className = "console-badge";
  executionBadgeEl.textContent = "Running...";
  consoleOutputEl.textContent = `[EXECUTING] rea ${activeCommand} ${args.join(" ")}\n\nPlease wait...`;

  try {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: activeCommand,
        args,
        flags,
      }),
    });

    const data = await res.json();

    if (data.exitCode === 0) {
      executionBadgeEl.className = "console-badge badge-success";
      executionBadgeEl.textContent = `Success (${data.durationMs}ms)`;
    } else {
      executionBadgeEl.className = "console-badge badge-error";
      executionBadgeEl.textContent = `Exit Code: ${data.exitCode} (${data.durationMs}ms)`;
    }

    if (data.json) {
      consoleOutputEl.textContent = JSON.stringify(data.json, null, 2);
    } else {
      consoleOutputEl.textContent =
        (data.stdout || "") + (data.stderr ? `\n[STDERR]\n${data.stderr}` : "");
    }
  } catch (err) {
    executionBadgeEl.className = "console-badge badge-error";
    executionBadgeEl.textContent = "Network Error";
    consoleOutputEl.textContent = `Failed to contact server bridge: ${err.message}`;
  }
}

// Event Listeners
btnExecuteEl.addEventListener("click", executeCommand);

// Quick card clicks
document.querySelectorAll(".quick-card").forEach((card) => {
  card.addEventListener("click", () => {
    const cmd = card.getAttribute("data-cmd");
    if (cmd) {
      selectCommand(cmd);
      window.scrollTo({ top: 300, behavior: "smooth" });
    }
  });
});

// Category filtering
categoryChipsEl.addEventListener("click", (e) => {
  if (e.target.classList.contains("filter-chip")) {
    document
      .querySelectorAll(".filter-chip")
      .forEach((c) => c.classList.remove("active"));
    e.target.classList.add("active");
    currentCategory = e.target.getAttribute("data-cat");
    renderCommandList();
  }
});

// Search input
commandSearchEl.addEventListener("input", renderCommandList);

// Copy, Clear & Save
const btnSaveResultEl = document.getElementById("btnSaveResult");

btnSaveResultEl?.addEventListener("click", async () => {
  const content = consoleOutputEl.textContent;
  if (
    !content ||
    content.startsWith("// Ready.") ||
    content.startsWith("[EXECUTING]")
  ) {
    alert("No completed analysis output to save yet!");
    return;
  }

  const defaultFolder = "mywork for testing";
  const customFolder = prompt(
    "Enter folder name to save findings in:",
    defaultFolder,
  );
  if (!customFolder) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultName = `${activeCommand}_${timestamp}.json`;
  const customName = prompt("Enter file name:", defaultName) || defaultName;

  try {
    btnSaveResultEl.textContent = "Saving...";
    const res = await fetch("/api/save-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderName: customFolder,
        fileName: customName,
        content: content,
      }),
    });
    const data = await res.json();
    if (data.success) {
      btnSaveResultEl.textContent = "Saved!";
      alert(`Findings saved successfully to:\n${data.savedPath}`);
      setTimeout(
        () => (btnSaveResultEl.textContent = "💾 Save Findings"),
        2000,
      );
    } else {
      alert(`Error saving findings: ${data.error}`);
      btnSaveResultEl.textContent = "💾 Save Findings";
    }
  } catch (err) {
    alert(`Failed to save: ${err.message}`);
    btnSaveResultEl.textContent = "💾 Save Findings";
  }
});

btnCopyResultEl.addEventListener("click", () => {
  navigator.clipboard.writeText(consoleOutputEl.textContent);
  btnCopyResultEl.textContent = "Copied!";
  setTimeout(() => (btnCopyResultEl.textContent = "Copy Output"), 1500);
});

btnClearConsoleEl.addEventListener("click", () => {
  consoleOutputEl.textContent = "// Ready.";
  executionBadgeEl.className = "console-badge";
  executionBadgeEl.textContent = "Ready";
});

// Drag and drop for target files
dropzoneEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzoneEl.classList.add("dragover");
});

dropzoneEl.addEventListener("dragleave", () => {
  dropzoneEl.classList.remove("dragover");
});

dropzoneEl.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzoneEl.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    const path = file.path || file.name;
    const input = document.getElementById("primaryInput");
    if (input) {
      input.value = path;
      input.focus();
    }
  }
});

dropzoneEl.addEventListener("click", () => {
  const input = document.getElementById("primaryInput");
  if (input) input.focus();
});

// Modal File Browser logic
const fileModalEl = document.getElementById("fileModal");
const btnBrowseTargetEl = document.getElementById("btnBrowseTarget");
const btnCloseModalEl = document.getElementById("btnCloseModal");
const modalCurrentPathEl = document.getElementById("modalCurrentPath");
const modalFileListEl = document.getElementById("modalFileList");

async function loadDirectory(targetPath) {
  modalCurrentPathEl.textContent = "Loading " + targetPath + "...";
  modalFileListEl.innerHTML =
    '<div style="color:var(--text-dim); padding:10px;">Loading contents...</div>';

  try {
    const res = await fetch(
      `/api/browse?dir=${encodeURIComponent(targetPath)}`,
    );
    const data = await res.json();
    if (data.error) {
      modalFileListEl.innerHTML = `<div style="color:var(--accent-rose); padding:10px;">${data.error}</div>`;
      return;
    }

    modalCurrentPathEl.textContent = data.currentDir;
    modalFileListEl.innerHTML = "";

    // Parent directory button
    if (data.parentDir && data.parentDir !== data.currentDir) {
      const upEl = document.createElement("div");
      upEl.className = "modal-item dir";
      upEl.innerHTML = "<span>📁 .. (Up one level)</span>";
      upEl.addEventListener("click", () => loadDirectory(data.parentDir));
      modalFileListEl.appendChild(upEl);
    }

    // Select this directory directly
    const selectThisDirEl = document.createElement("div");
    selectThisDirEl.className = "modal-item";
    selectThisDirEl.style.background = "rgba(99, 102, 241, 0.15)";
    selectThisDirEl.innerHTML = `<span>✔ Select this entire folder: <strong>${data.currentDir}</strong></span>`;
    selectThisDirEl.addEventListener("click", () => {
      const input = document.getElementById("primaryInput");
      if (input) input.value = data.currentDir;
      fileModalEl.style.display = "none";
    });
    modalFileListEl.appendChild(selectThisDirEl);

    // List contents
    data.items.forEach((item) => {
      const itemEl = document.createElement("div");
      itemEl.className = `modal-item ${item.isDir ? "dir" : ""}`;
      itemEl.innerHTML = `
        <span>${item.isDir ? "📁" : "📄"} ${item.name}</span>
        <span style="font-size:11px; color:var(--text-dim);">${item.isDir ? "Folder" : item.ext}</span>
      `;
      itemEl.addEventListener("click", () => {
        if (item.isDir) {
          loadDirectory(item.path);
        } else {
          const input = document.getElementById("primaryInput");
          if (input) input.value = item.path;
          fileModalEl.style.display = "none";
        }
      });
      modalFileListEl.appendChild(itemEl);
    });
  } catch (err) {
    modalFileListEl.innerHTML = `<div style="color:var(--accent-rose); padding:10px;">Failed to browse: ${err.message}</div>`;
  }
}

btnBrowseTargetEl?.addEventListener("click", () => {
  const currentVal = document.getElementById("primaryInput")?.value.trim();
  const startDir = currentVal && currentVal.length > 2 ? currentVal : "C:\\";
  fileModalEl.style.display = "flex";
  loadDirectory(startDir);
});

btnCloseModalEl?.addEventListener("click", () => {
  fileModalEl.style.display = "none";
});

// Doctor & Help Buttons
btnDoctorEl.addEventListener("click", () => {
  selectCommand("doctor");
  executeCommand();
});

btnHelpEl.addEventListener("click", () => {
  selectCommand("capabilities");
  executeCommand();
});

// Start initialization
init();
