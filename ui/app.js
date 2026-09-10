// tronExplorer - Frontend Controller
(function() {
  // Tauri IPC helper
  const invoke = window.__TAURI__?.core?.invoke || (async () => {
    console.warn("Tauri invoke no disponible en navegador independiente");
    return null;
  });

  const listen = window.__TAURI__?.event?.listen || (async () => {
    return () => {};
  });

  // State Management
  const state = {
    currentDirectory: '',
    items: [],
    filteredItems: [],
    selectedIndex: -1,
    selectionAnchor: -1,
    selectedItems: new Set(),
    history: [],
    historyIndex: -1,
    quickViewOpen: false,
    searchQuery: '',
    isSearchingRecursive: false,
    dirSizes: new Map(), // path -> { total_size, file_count, dir_count }
    activeDirCalcId: null, // token to discard obsolete directory calculations
    activeTransfers: new Map(), // op_id -> { id, action, items, targetDir, currentItem, currentIndex, totalItems, bytesCopied, totalBytes, startTime, speed, isDone, success, error }
    drives: [],
    favorites: [],
    clipboard: {
      action: null, // 'copy' or 'cut'
      paths: []
    },
    sortField: 'name', // 'name', 'type', 'size', 'date'
    sortAsc: true,
    contextTargetItem: null,
    showHiddenFiles: localStorage.getItem('tron_show_hidden') === 'true',
    customTextExts: (localStorage.getItem('tron_custom_text_exts') || 'sql, str, log, conf, env, bak')
      .split(',')
      .map(s => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean),
    textEditor: localStorage.getItem('tron_text_editor') || 'notepad',
    textEditorCustomPath: localStorage.getItem('tron_text_editor_custom') || '',
    terminalApp: localStorage.getItem('tron_terminal_app') || 'default',
    terminalCustomPath: localStorage.getItem('tron_terminal_custom') || '',
    monochromeIcons: localStorage.getItem('tron_monochrome_icons') === 'true',
    draggedInternalPaths: [],
    activeSherlockFilter: null,
    sherlockResults: null,
    searchItems: null
  };

  // DOM Elements
  const el = {
    fileList: document.getElementById('fileList'),
    breadcrumbs: document.getElementById('breadcrumbs'),
    quickLinks: document.getElementById('quickLinks'),
    favoriteLinks: document.getElementById('favoriteLinks'),
    driveLinks: document.getElementById('driveLinks'),
    searchInput: document.getElementById('searchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    chkShowHidden: document.getElementById('chkShowHidden'),
    btnBack: document.getElementById('btnBack'),
    btnForward: document.getElementById('btnForward'),
    btnParentDir: document.getElementById('btnParentDir'),
    btnRefresh: document.getElementById('btnRefresh'),
    statusItemCount: document.getElementById('statusItemCount'),
    statusSelection: document.getElementById('statusSelection'),
    quickViewModal: document.getElementById('quickViewModal'),
    quickViewCard: document.getElementById('quickViewCard'),
    qvTitle: document.getElementById('qvTitle'),
    qvIcon: document.getElementById('qvIcon'),
    qvBadge: document.getElementById('qvBadge'),
    qvContent: document.getElementById('qvContent'),
    qvDetails: document.getElementById('qvDetails'),
    btnQvClose: document.getElementById('btnQvClose'),
    btnQvDelete: document.getElementById('btnQvDelete'),
    btnQvOpenDefault: document.getElementById('btnQvOpenDefault'),
    btnQvOpenEditor: document.getElementById('btnQvOpenEditor'),
    // Sort Header Elements
    sortHeaderName: document.getElementById('sortHeaderName'),
    sortHeaderType: document.getElementById('sortHeaderType'),
    sortHeaderSize: document.getElementById('sortHeaderSize'),
    sortHeaderDate: document.getElementById('sortHeaderDate'),
    sortIconName: document.getElementById('sortIconName'),
    sortIconType: document.getElementById('sortIconType'),
    sortIconSize: document.getElementById('sortIconSize'),
    sortIconDate: document.getElementById('sortIconDate'),
    // Action bar buttons
    btnActionTerminal: document.getElementById('btnActionTerminal'),
    btnActionEdit: document.getElementById('btnActionEdit'),
    btnActionNewFile: document.getElementById('btnActionNewFile'),
    btnActionNewFolder: document.getElementById('btnActionNewFolder'),
    btnActionCut: document.getElementById('btnActionCut'),
    btnActionCopy: document.getElementById('btnActionCopy'),
    btnActionPaste: document.getElementById('btnActionPaste'),
    btnActionDelete: document.getElementById('btnActionDelete'),
    btnActionQuickView: document.getElementById('btnActionQuickView'),
    btnActionCalcDirSizes: document.getElementById('btnActionCalcDirSizes'),
    btnOpenAppearance: document.getElementById('btnOpenAppearance'),
    chkRecursiveSearch: document.getElementById('chkRecursiveSearch'),
    clipboardBadge: document.getElementById('clipboardBadge'),
    pasteProgressContainer: document.getElementById('pasteProgressContainer'),
    pasteProgressBar: document.getElementById('pasteProgressBar'),
    pasteProgressPercent: document.getElementById('pasteProgressPercent'),
    pasteProgressLabel: document.getElementById('pasteProgressLabel'),
    pasteDetailsCard: document.getElementById('pasteDetailsCard'),
    pasteDetailsTitle: document.getElementById('pasteDetailsTitle'),
    pasteTasksList: document.getElementById('pasteTasksList'),
    btnClosePasteDetails: document.getElementById('btnClosePasteDetails'),
    btnAddCurrentFav: document.getElementById('btnAddCurrentFav'),
    btnConnectNetwork: document.getElementById('btnConnectNetwork'),
    btnOpenNetworkDialog: document.getElementById('btnOpenNetworkDialog'),
    // Modals
    modalNewFile: document.getElementById('modalNewFile'),
    inputNewFileName: document.getElementById('inputNewFileName'),
    chkOpenAfterCreate: document.getElementById('chkOpenAfterCreate'),
    btnConfirmNewFile: document.getElementById('btnConfirmNewFile'),
    btnCancelNewFile: document.getElementById('btnCancelNewFile'),
    btnCloseNewFileModal: document.getElementById('btnCloseNewFileModal'),
    modalNewFolder: document.getElementById('modalNewFolder'),
    inputNewFolderName: document.getElementById('inputNewFolderName'),
    btnConfirmNewFolder: document.getElementById('btnConfirmNewFolder'),
    btnCancelNewFolder: document.getElementById('btnCancelNewFolder'),
    btnCloseNewFolderModal: document.getElementById('btnCloseNewFolderModal'),
    modalNetwork: document.getElementById('modalNetwork'),
    inputNetworkPath: document.getElementById('inputNetworkPath'),
    btnConfirmNetwork: document.getElementById('btnConfirmNetwork'),
    btnCancelNetwork: document.getElementById('btnCancelNetwork'),
    btnCloseNetworkModal: document.getElementById('btnCloseNetworkModal'),
    modalHelp: document.getElementById('modalHelp'),
    btnCloseHelpModal: document.getElementById('btnCloseHelpModal'),
    btnConfirmHelp: document.getElementById('btnConfirmHelp'),
    modalAppearance: document.getElementById('modalAppearance'),
    rangeUiScale: document.getElementById('rangeUiScale'),
    lblUiScaleValue: document.getElementById('lblUiScaleValue'),
    selectTheme: document.getElementById('selectTheme'),
    chkMonochromeIcons: document.getElementById('chkMonochromeIcons'),
    selectTextEditor: document.getElementById('selectTextEditor'),
    customEditorContainer: document.getElementById('customEditorContainer'),
    inputCustomEditor: document.getElementById('inputCustomEditor'),
    selectTerminalApp: document.getElementById('selectTerminalApp'),
    customTerminalContainer: document.getElementById('customTerminalContainer'),
    inputCustomTerminal: document.getElementById('inputCustomTerminal'),
    selectFontSize: document.getElementById('selectFontSize'),
    chkNormalFontWeight: document.getElementById('chkNormalFontWeight'),
    chkPrefShowHidden: document.getElementById('chkPrefShowHidden'),
    chkPrefRecursiveSearch: document.getElementById('chkPrefRecursiveSearch'),
    inputCustomTextExts: document.getElementById('inputCustomTextExts'),
    btnCancelAppearance: document.getElementById('btnCancelAppearance'),
    btnConfirmAppearance: document.getElementById('btnConfirmAppearance'),
    btnCloseAppearanceModal: document.getElementById('btnCloseAppearanceModal'),
    modalRenameItem: document.getElementById('modalRenameItem'),
    inputRenameItemName: document.getElementById('inputRenameItemName'),
    btnConfirmRenameItem: document.getElementById('btnConfirmRenameItem'),
    btnCancelRenameItem: document.getElementById('btnCancelRenameItem'),
    btnCloseRenameItemModal: document.getElementById('btnCloseRenameItemModal'),
    modalRenameFavorite: document.getElementById('modalRenameFavorite'),
    inputRenameFavName: document.getElementById('inputRenameFavName'),
    btnConfirmRenameFav: document.getElementById('btnConfirmRenameFav'),
    btnCancelRenameFav: document.getElementById('btnCancelRenameFav'),
    btnCloseRenameFavModal: document.getElementById('btnCloseRenameFavModal'),
    modalConfirmExit: document.getElementById('modalConfirmExit'),
    btnCancelExit: document.getElementById('btnCancelExit'),
    btnForceExit: document.getElementById('btnForceExit'),
    btnCloseExitModal: document.getElementById('btnCloseExitModal'),
    modalAbout: document.getElementById('modalAbout'),
    btnCloseAboutModal: document.getElementById('btnCloseAboutModal'),
    btnConfirmAbout: document.getElementById('btnConfirmAbout'),
    aboutVersion: document.getElementById('aboutVersion'),
    aboutBuildUnix: document.getElementById('aboutBuildUnix'),
    aboutBuildDate: document.getElementById('aboutBuildDate'),
    linkAboutGithub: document.getElementById('linkAboutGithub'),
    // Menus
    menuNewFile: document.getElementById('menuNewFile'),
    menuNewFolder: document.getElementById('menuNewFolder'),
    menuRename: document.getElementById('menuRename'),
    menuOpenDefault: document.getElementById('menuOpenDefault'),
    menuOpenWith: document.getElementById('menuOpenWith'),
    menuShowInExplorer: document.getElementById('menuShowInExplorer'),
    menuCompress: document.getElementById('menuCompress'),
    menuProperties: document.getElementById('menuProperties'),
    menuDelete: document.getElementById('menuDelete'),
    menuAddFavorite: document.getElementById('menuAddFavorite'),
    menuCut: document.getElementById('menuCut'),
    menuCopy: document.getElementById('menuCopy'),
    menuPaste: document.getElementById('menuPaste'),
    menuSelectAll: document.getElementById('menuSelectAll'),
    menuQuickView: document.getElementById('menuQuickView'),
    menuCalcDirSizes: document.getElementById('menuCalcDirSizes'),
    menuRefresh: document.getElementById('menuRefresh'),
    menuToggleHidden: document.getElementById('menuToggleHidden'),
    menuAppearance: document.getElementById('menuAppearance'),
    menuShortcuts: document.getElementById('menuShortcuts'),
    menuAbout: document.getElementById('menuAbout'),
    // File Context Menu
    fileContextMenu: document.getElementById('fileContextMenu'),
    ctxMenuOpen: document.getElementById('ctxMenuOpen'),
    ctxMenuOpenWith: document.getElementById('ctxMenuOpenWith'),
    ctxMenuQuickView: document.getElementById('ctxMenuQuickView'),
    ctxMenuOpenEditor: document.getElementById('ctxMenuOpenEditor'),
    ctxMenuOpenLocation: document.getElementById('ctxMenuOpenLocation'),
    ctxMenuShowInExplorer: document.getElementById('ctxMenuShowInExplorer'),
    ctxMenuExtractHere: document.getElementById('ctxMenuExtractHere'),
    ctxMenuExtractToFolder: document.getElementById('ctxMenuExtractToFolder'),
    ctxMenuExtractToFolderText: document.getElementById('ctxMenuExtractToFolderText'),
    ctxMenuArchiveViewContent: document.getElementById('ctxMenuArchiveViewContent'),
    ctxMenuCompress: document.getElementById('ctxMenuCompress'),
    ctxMenuRename: document.getElementById('ctxMenuRename'),
    ctxMenuCut: document.getElementById('ctxMenuCut'),
    ctxMenuCopy: document.getElementById('ctxMenuCopy'),
    ctxMenuDuplicate: document.getElementById('ctxMenuDuplicate'),
    ctxMenuAddFavorite: document.getElementById('ctxMenuAddFavorite'),
    ctxMenuDelete: document.getElementById('ctxMenuDelete'),
    ctxMenuProperties: document.getElementById('ctxMenuProperties'),
    // Modals: Open With, Compress, Archive View
    modalOpenWith: document.getElementById('modalOpenWith'),
    btnCloseOpenWithModal: document.getElementById('btnCloseOpenWithModal'),
    btnCancelOpenWith: document.getElementById('btnCancelOpenWith'),
    openWithFileName: document.getElementById('openWithFileName'),
    openWithSuggestions: document.getElementById('openWithSuggestions'),
    inputOpenWithApp: document.getElementById('inputOpenWithApp'),
    btnLaunchCustomApp: document.getElementById('btnLaunchCustomApp'),
    btnOpenWithSystemDialog: document.getElementById('btnOpenWithSystemDialog'),
    modalCompress: document.getElementById('modalCompress'),
    btnCloseCompressModal: document.getElementById('btnCloseCompressModal'),
    btnCancelCompress: document.getElementById('btnCancelCompress'),
    btnConfirmCompress: document.getElementById('btnConfirmCompress'),
    inputCompressName: document.getElementById('inputCompressName'),
    compressItemsCount: document.getElementById('compressItemsCount'),
    modalArchiveView: document.getElementById('modalArchiveView'),
    btnCloseArchiveViewModal: document.getElementById('btnCloseArchiveViewModal'),
    btnArchiveClose: document.getElementById('btnArchiveClose'),
    archiveViewFileName: document.getElementById('archiveViewFileName'),
    inputArchiveFilter: document.getElementById('inputArchiveFilter'),
    archiveTotalCount: document.getElementById('archiveTotalCount'),
    archiveTableBody: document.getElementById('archiveTableBody'),
    btnArchiveExtractAll: document.getElementById('btnArchiveExtractAll'),
    // Sherlock Advanced Search Elements
    btnActionSherlock: document.getElementById('btnActionSherlock'),
    sherlockBanner: document.getElementById('sherlockBanner'),
    sherlockBannerTitle: document.getElementById('sherlockBannerTitle'),
    sherlockBannerScope: document.getElementById('sherlockBannerScope'),
    sherlockBannerCount: document.getElementById('sherlockBannerCount'),
    btnSherlockBannerEdit: document.getElementById('btnSherlockBannerEdit'),
    btnSherlockBannerClose: document.getElementById('btnSherlockBannerClose'),
    modalSherlock: document.getElementById('modalSherlock'),
    btnCloseSherlockModal: document.getElementById('btnCloseSherlockModal'),
    btnCancelSherlock: document.getElementById('btnCancelSherlock'),
    sherlockCurrentPath: document.getElementById('sherlockCurrentPath'),
    chkSherlockRoot: document.getElementById('chkSherlockRoot'),
    btnPreset24h: document.getElementById('btnPreset24h'),
    btnPresetLargeFiles: document.getElementById('btnPresetLargeFiles'),
    btnPresetLargeDirs: document.getElementById('btnPresetLargeDirs'),
    inputSherlockQuery: document.getElementById('inputSherlockQuery'),
    selectSherlockSizeMode: document.getElementById('selectSherlockSizeMode'),
    sherlockSizeControls: document.getElementById('sherlockSizeControls'),
    sliderSherlockSize: document.getElementById('sliderSherlockSize'),
    inputSherlockSizeNum: document.getElementById('inputSherlockSizeNum'),
    selectSherlockSizeUnit: document.getElementById('selectSherlockSizeUnit'),
    inputSherlockDateStart: document.getElementById('inputSherlockDateStart'),
    inputSherlockDateEnd: document.getElementById('inputSherlockDateEnd'),
    btnDateQuickWeek: document.getElementById('btnDateQuickWeek'),
    btnDateQuickMonth: document.getElementById('btnDateQuickMonth'),
    btnDateClear: document.getElementById('btnDateClear'),
    btnResetSherlockFilters: document.getElementById('btnResetSherlockFilters'),
    btnExecuteSherlock: document.getElementById('btnExecuteSherlock'),
    txtExecuteSherlock: document.getElementById('txtExecuteSherlock')
  };

  // Format Helpers
  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(unixSeconds) {
    if (!unixSeconds) return '--';
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getFileIcon(item) {
    if (item.is_directory) return '📁';
    const ext = (item.extension || '').toLowerCase();
    if (state.customTextExts.includes(ext)) return '📄';
    if (['docx', 'doc', 'docm', 'dotx', 'dot', 'odt', 'rtf'].includes(ext)) return '📘';
    if (['xlsx', 'xls', 'xlsm', 'xlsb', 'xltx', 'xlt', 'ods'].includes(ext)) return '📊';
    if (['pptx', 'ppt', 'pptm', 'potx', 'pot', 'odp'].includes(ext)) return '📙';
    switch (item.file_type) {
      case 'image': return '🖼️';
      case 'audio': return '🎵';
      case 'video': return '🎬';
      case 'text': return '📄';
      case 'office': return '📑';
      default: return '📦';
    }
  }

  function getFileTypeName(item) {
    if (item.is_directory) return 'Carpeta';
    const ext = (item.extension || '').toLowerCase();
    if (ext) {
      if (state.customTextExts.includes(ext)) {
        return `Texto (.${ext.toUpperCase()})`;
      }
      const extMap = {
        'pdf': 'PDF',
        'png': 'Imagen PNG',
        'jpg': 'Imagen JPEG',
        'jpeg': 'Imagen JPEG',
        'gif': 'Imagen GIF',
        'webp': 'Imagen WebP',
        'svg': 'Imagen SVG',
        'ico': 'Icono',
        'dng': 'Imagen RAW (DNG)',
        'heic': 'Imagen HEIC',
        'heif': 'Imagen HEIF',
        'avif': 'Imagen AVIF',
        'cr2': 'Imagen RAW Canon',
        'nef': 'Imagen RAW Nikon',
        'arw': 'Imagen RAW Sony',
        'raw': 'Imagen RAW',
        'docx': 'Documento Word',
        'doc': 'Documento Word (97-2003)',
        'xlsx': 'Hoja de cálculo Excel',
        'xls': 'Hoja de cálculo Excel (97-2003)',
        'pptx': 'Presentación PowerPoint',
        'ppt': 'Presentación PowerPoint (97-2003)',
        'odt': 'Documento OpenDocument',
        'ods': 'Hoja de cálculo OpenDocument',
        'odp': 'Presentación OpenDocument',
        'rtf': 'Documento RTF',
        'mp4': 'Vídeo MP4',
        'mkv': 'Vídeo MKV',
        'avi': 'Vídeo AVI',
        'webm': 'Vídeo WebM',
        'mp3': 'Audio MP3',
        'wav': 'Audio WAV',
        'flac': 'Audio FLAC',
        'ogg': 'Audio OGG',
        'txt': 'Texto',
        'md': 'Markdown',
        'rs': 'Código Rust',
        'py': 'Código Python',
        'js': 'JavaScript',
        'json': 'JSON',
        'yaml': 'YAML',
        'yml': 'YAML',
        'toml': 'TOML',
        'html': 'HTML',
        'css': 'CSS',
        'sql': 'Script SQL',
        'str': 'Archivo Texto (STR)',
        'zip': 'Archivo ZIP',
        'rar': 'Archivo RAR',
        '7z': 'Archivo 7Z',
        'tar': 'Archivo TAR',
        'gz': 'Archivo GZ',
        'exe': 'Ejecutable',
        'dll': 'Librería DLL'
      };
      if (extMap[ext]) return extMap[ext];
      return ext.toUpperCase();
    }
    return item.file_type ? item.file_type.toUpperCase() : 'Archivo';
  }

  function sortItems(list) {
    return list.sort((a, b) => {
      // Directories always come first
      if (a.is_directory && !b.is_directory) return -1;
      if (!a.is_directory && b.is_directory) return 1;

      let res = 0;
      switch (state.sortField) {
        case 'name':
          res = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
          break;
        case 'type':
          const typeA = a.is_directory ? ' ' : (a.extension || '');
          const typeB = b.is_directory ? ' ' : (b.extension || '');
          res = typeA.localeCompare(typeB, 'es', { sensitivity: 'base' });
          if (res === 0) {
            res = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
          }
          break;
        case 'size':
          const sizeA = a.is_directory ? (state.dirSizes.get(a.path)?.total_size || a.size || 0) : (a.size || 0);
          const sizeB = b.is_directory ? (state.dirSizes.get(b.path)?.total_size || b.size || 0) : (b.size || 0);
          if (sizeA < sizeB) res = -1;
          else if (sizeA > sizeB) res = 1;
          else res = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
          break;
        case 'date':
          const dateA = a.modified || 0;
          const dateB = b.modified || 0;
          if (dateA < dateB) res = -1;
          else if (dateA > dateB) res = 1;
          else res = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
          break;
      }
      return state.sortAsc ? res : -res;
    });
  }

  function updateSortHeaderUI() {
    const fields = ['Name', 'Type', 'Size', 'Date'];
    const currentFieldCap = state.sortField.charAt(0).toUpperCase() + state.sortField.slice(1);

    fields.forEach(f => {
      const icon = el['sortIcon' + f];
      if (!icon) return;
      if (f === currentFieldCap) {
        icon.classList.remove('hidden');
        icon.textContent = state.sortAsc ? '▲' : '▼';
      } else {
        icon.classList.add('hidden');
        icon.textContent = '';
      }
    });
  }

  function setSort(field) {
    if (state.sortField === field) {
      state.sortAsc = !state.sortAsc;
    } else {
      state.sortField = field;
      state.sortAsc = true;
    }
    updateSortHeaderUI();
    applyFilter();
    // Maintain selection of active item
    if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
      const selectedPath = Array.from(state.selectedItems)[0];
      if (selectedPath) {
        const newIdx = state.filteredItems.findIndex(i => i.path === selectedPath);
        if (newIdx >= 0) state.selectedIndex = newIdx;
      }
    }
    renderFileList();
    updateStatusBar();
  }

  // Directory Loading
  async function loadDirectory(path, addToHistory = true) {
    try {
      el.fileList.innerHTML = `<div class="p-4 text-xs text-gnome-textDim">Cargando directorio...</div>`;
      const res = await invoke('read_directory', { path });
      if (!res) return;

      state.currentDirectory = res.current_path;
      state.items = res.items || [];
      state.searchQuery = '';
      state.isSearchingRecursive = false;
      state.sherlockResults = null;
      state.searchItems = null;
      if (el.sherlockBanner) el.sherlockBanner.classList.add('hidden');
      state.activeSherlockFilter = null;
      el.searchInput.value = '';
      el.btnClearSearch.classList.add('hidden');
      applyFilter();

      if (addToHistory) {
        if (state.historyIndex < state.history.length - 1) {
          state.history = state.history.slice(0, state.historyIndex + 1);
        }
        state.history.push(state.currentDirectory);
        state.historyIndex = state.history.length - 1;
      }
      updateHistoryButtons();
      renderBreadcrumbs();
      state.selectedIndex = state.filteredItems.length > 0 ? 0 : -1;
      state.selectedItems.clear();
      if (state.selectedIndex >= 0) {
        state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
      }
      renderFileList();
      updateStatusBar();
      el.fileList.focus();
    } catch (err) {
      alert('Error al acceder al directorio: ' + err);
    }
  }

  function updateHistoryButtons() {
    el.btnBack.disabled = state.historyIndex <= 0;
    el.btnForward.disabled = state.historyIndex >= state.history.length - 1;
    if (el.btnParentDir) {
      const p = state.currentDirectory ? state.currentDirectory.replace(/\\/g, '/').replace(/\/+$/, '') : '';
      el.btnParentDir.disabled = !p || p === '/' || (p.length === 2 && p.endsWith(':'));
    }
  }

  // Breadcrumbs
  function renderBreadcrumbs() {
    el.breadcrumbs.innerHTML = '';
    if (!state.currentDirectory) return;

    const isWindows = /^[a-zA-Z]:[\\\/]/.test(state.currentDirectory) || state.currentDirectory.startsWith('\\\\');

    if (isWindows) {
      const rawPath = state.currentDirectory.replace(/\//g, '\\');
      const isUnc = rawPath.startsWith('\\\\');
      const parts = rawPath.split('\\').filter(p => p.length > 0);

      let accumulated = isUnc ? '\\\\' : '';
      parts.forEach((part, idx) => {
        if (idx === 0 && part.endsWith(':')) {
          accumulated = part + '\\';
        } else if (isUnc && idx === 0) {
          accumulated = '\\\\' + part;
        } else {
          accumulated += (accumulated.endsWith('\\') ? '' : '\\') + part;
        }
        const targetPath = accumulated;

        const btn = document.createElement('button');
        btn.className = 'px-1.5 py-0.5 rounded hover:bg-gnome-hover hover:text-white transition-colors ' +
          (idx === parts.length - 1 ? 'font-semibold text-gnome-active' : 'text-gnome-textDim');
        btn.textContent = part;
        btn.title = targetPath;
        btn.onclick = () => loadDirectory(targetPath);
        el.breadcrumbs.appendChild(btn);

        if (idx < parts.length - 1) {
          const sep = document.createElement('span');
          sep.className = 'text-gnome-border select-none';
          sep.textContent = '/';
          el.breadcrumbs.appendChild(sep);
        }
      });
    } else {
      // Unix / Linux / macOS
      const norm = state.currentDirectory.replace(/\\/g, '/');
      const parts = norm.split('/').filter(p => p.length > 0);

      // Root button "/"
      const rootBtn = document.createElement('button');
      rootBtn.className = 'px-1.5 py-0.5 rounded hover:bg-gnome-hover hover:text-white transition-colors ' +
        (parts.length === 0 ? 'font-semibold text-gnome-active' : 'text-gnome-textDim');
      rootBtn.textContent = '/';
      rootBtn.title = '/';
      rootBtn.onclick = () => loadDirectory('/');
      el.breadcrumbs.appendChild(rootBtn);

      let accumulated = '';
      parts.forEach((part, idx) => {
        accumulated += '/' + part;
        const targetPath = accumulated;

        const sep = document.createElement('span');
        sep.className = 'text-gnome-border select-none';
        sep.textContent = '/';
        el.breadcrumbs.appendChild(sep);

        const btn = document.createElement('button');
        btn.className = 'px-1.5 py-0.5 rounded hover:bg-gnome-hover hover:text-white transition-colors ' +
          (idx === parts.length - 1 ? 'font-semibold text-gnome-active' : 'text-gnome-textDim');
        btn.textContent = part;
        btn.title = targetPath;
        btn.onclick = () => loadDirectory(targetPath);
        el.breadcrumbs.appendChild(btn);
      });
    }
    el.breadcrumbs.scrollLeft = el.breadcrumbs.scrollWidth;
  }

  // File Filtering & Sorting
  function applyFilter() {
    if (state.activeSherlockFilter && state.sherlockResults) {
      let res = state.sherlockResults;
      if (!state.showHiddenFiles) {
        res = res.filter(item => !item.is_hidden);
      }
      state.filteredItems = sortItems([...res]);
      return;
    }

    if (state.isSearchingRecursive && state.searchItems) {
      let res = state.searchItems;
      if (!state.showHiddenFiles) {
        res = res.filter(item => !item.is_hidden);
      }
      state.filteredItems = sortItems([...res]);
      return;
    }

    const q = state.searchQuery.toLowerCase().trim();
    let res = state.items;
    if (!state.showHiddenFiles) {
      res = res.filter(item => !item.is_hidden);
    }
    if (q) {
      res = res.filter(item => item.name.toLowerCase().includes(q));
    }
    state.filteredItems = sortItems([...res]);
  }

  // File List Rendering
  function renderFileList() {
    el.fileList.innerHTML = '';
    if (state.filteredItems.length === 0) {
      el.fileList.innerHTML = `<div class="p-8 text-center text-xs text-gnome-textDim">Directorio vacío o sin coincidencias</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    state.filteredItems.forEach((item, idx) => {
      const isSelected = state.selectedItems.has(item.path);
      const isFocused = idx === state.selectedIndex;

      const isCut = state.clipboard.action === 'cut' && state.clipboard.paths.includes(item.path);

      const row = document.createElement('div');
      row.dataset.index = idx;
      row.dataset.path = item.path;
      const hiddenClass = item.is_hidden ? 'opacity-65' : '';
      row.className = `file-row grid grid-cols-12 gap-2 px-4 items-center cursor-pointer transition-colors ${
        isSelected
          ? 'bg-gnome-active text-white'
          : isFocused
          ? 'bg-gnome-hover text-gnome-text'
          : 'hover:bg-gnome-hover/50 text-gnome-text'
      } ${isCut ? 'opacity-40 italic' : ''} ${hiddenClass}`;

      // 1. Name & Icon (col-span-6)
      const colName = document.createElement('div');
      colName.className = 'col-span-6 flex items-center gap-2 min-w-0 pointer-events-none';
      const fontClass = state.normalFontWeight ? 'font-normal' : 'font-medium';
      
      let parentPathHtml = '';
      if (state.isSearchingRecursive && item.path) {
        const isWindows = /^[a-zA-Z]:[\\\/]/.test(item.path) || item.path.startsWith('\\\\');
        const sep = isWindows ? '\\' : '/';
        const normalized = isWindows ? item.path.replace(/\//g, '\\') : item.path.replace(/\\/g, '/');
        const lastSlash = normalized.lastIndexOf(sep);
        if (lastSlash > 0) {
          const parentDir = normalized.substring(0, lastSlash);
          let displayParent = parentDir;
          if (state.currentDirectory && parentDir.toLowerCase().startsWith(state.currentDirectory.toLowerCase())) {
            displayParent = '.' + parentDir.substring(state.currentDirectory.length);
          }
          parentPathHtml = `
            <button type="button" class="btn-goto-parent shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gnome-sidebar/80 border border-gnome-border hover:border-gnome-active hover:text-gnome-active text-gnome-textDim transition-colors truncate max-w-[150px] pointer-events-auto" title="Ir a la carpeta: ${escapeHtml(parentDir)}" data-parent-dir="${escapeHtml(parentDir)}">
              📁 ${escapeHtml(displayParent)}
            </button>
          `;
        }
      }

      colName.innerHTML = `
        <span class="shrink-0 text-sm select-none item-icon">${getFileIcon(item)}</span>
        <span class="truncate select-none ${fontClass}">${escapeHtml(item.name)}</span>
        ${parentPathHtml}
      `;

      // 2. Type (col-span-2)
      const colType = document.createElement('div');
      colType.className = `col-span-2 select-none truncate pointer-events-none ${isSelected ? 'text-white/80' : 'text-gnome-textDim'}`;
      colType.textContent = getFileTypeName(item);

      // 3. Size (col-span-2)
      const colSize = document.createElement('div');
      colSize.className = `col-span-2 text-right select-none truncate pointer-events-none ${isSelected ? 'text-white/80' : 'text-gnome-textDim'}`;
      if (item.is_directory) {
        if (state.dirSizes.has(item.path)) {
          const info = state.dirSizes.get(item.path);
          colSize.textContent = formatSize(info.total_size);
          colSize.title = `${info.file_count} archivos, ${info.dir_count} subcarpetas`;
        } else {
          colSize.textContent = '--';
        }
      } else {
        colSize.textContent = formatSize(item.size);
      }

      // 4. Modified Date (col-span-2)
      const colDate = document.createElement('div');
      colDate.className = `col-span-2 text-right select-none truncate pointer-events-none ${isSelected ? 'text-white/80' : 'text-gnome-textDim'}`;
      colDate.textContent = formatDate(item.modified);

      row.appendChild(colName);
      row.appendChild(colType);
      row.appendChild(colSize);
      row.appendChild(colDate);

      // Click Events
      row.addEventListener('click', (e) => {
        const btnParent = e.target.closest('.btn-goto-parent');
        if (btnParent && btnParent.dataset.parentDir) {
          e.stopPropagation();
          loadDirectory(btnParent.dataset.parentDir);
          return;
        }
        handleRowClick(e, idx);
      });
      row.addEventListener('dblclick', (e) => {
        const btnParent = e.target.closest('.btn-goto-parent');
        if (btnParent) return;
        activateItem(item);
      });

      // Custom Context Menu on Right Click
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFileContextMenu(e, item, idx);
      });

      // Drag and Drop (Files / Folders)
      setupRowDragAndDrop(row, item);

      fragment.appendChild(row);
    });

    el.fileList.appendChild(fragment);
    ensureVisible(state.selectedIndex);
  }

  // Custom Pointer-based Drag & Drop implementation
  function setupRowDragAndDrop(row, item) {
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    row.addEventListener('pointerdown', (e) => {
      // Don't drag if clicking a button (like parent dir button) or right clicking
      if (e.target.closest('button') || e.button !== 0) return;
      
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      isDragging = false;
      
      const onPointerMove = (moveEvent) => {
        if (!isDragging) {
          const dx = moveEvent.clientX - dragStartX;
          const dy = moveEvent.clientY - dragStartY;
          if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            // Start dragging
            isDragging = true;
            let pathsToDrag = [];
            if (state.selectedItems.has(item.path)) {
              pathsToDrag = Array.from(state.selectedItems);
            } else {
              pathsToDrag = [item.path];
            }
            state.draggedInternalPaths = pathsToDrag;
            
            // Set global dragging state class
            document.body.classList.add('internal-dragging');
            row.classList.add('opacity-50');
            
            // Note: We don't create a visual ghost element to keep it simple, 
            // the system cursor won't change but the targets will highlight.
            // But let's create a minimal ghost attached to the mouse!
            const ghost = document.createElement('div');
            ghost.id = 'drag-ghost';
            ghost.className = 'fixed pointer-events-none bg-gnome-active text-white px-3 py-1 rounded shadow-lg z-[9999] opacity-80 whitespace-nowrap text-xs flex items-center gap-2';
            ghost.innerHTML = `<span>📄</span> ${pathsToDrag.length} elemento(s)`;
            ghost.style.left = `${moveEvent.clientX + 10}px`;
            ghost.style.top = `${moveEvent.clientY + 10}px`;
            document.body.appendChild(ghost);
          }
        }
        
        if (isDragging) {
          moveEvent.preventDefault();
          const ghost = document.getElementById('drag-ghost');
          if (ghost) {
            ghost.style.left = `${moveEvent.clientX + 10}px`;
            ghost.style.top = `${moveEvent.clientY + 10}px`;
          }
          
          // Find drop target under mouse (temporarily hiding ghost is not needed if pointer-events-none)
          const targetElement = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const dropTarget = targetElement ? targetElement.closest('.drop-target') : null;
          
          // Clear previous highlights
          document.querySelectorAll('.drop-highlight').forEach(el => {
            if (el !== dropTarget) el.classList.remove('drop-highlight', 'ring-2', 'ring-gnome-active', 'bg-gnome-hover');
          });
          
          // Add highlight to current target
          if (dropTarget) {
            const targetPath = dropTarget.dataset.path || dropTarget.dataset.targetDir;
            // Prevent dropping into itself
            if (!state.draggedInternalPaths.includes(targetPath)) {
              dropTarget.classList.add('drop-highlight', 'ring-2', 'ring-gnome-active', 'bg-gnome-hover');
            }
          }
        }
      };

      const onPointerUp = (upEvent) => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        
        if (isDragging) {
          isDragging = false;
          document.body.classList.remove('internal-dragging');
          row.classList.remove('opacity-50');
          const ghost = document.getElementById('drag-ghost');
          if (ghost) ghost.remove();
          
          // Find drop target
          const targetElement = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
          const dropTarget = targetElement ? targetElement.closest('.drop-target') : null;
          
          document.querySelectorAll('.drop-highlight').forEach(el => {
             el.classList.remove('drop-highlight', 'ring-2', 'ring-gnome-active', 'bg-gnome-hover');
          });
          
          if (dropTarget) {
             const targetPath = dropTarget.dataset.path || dropTarget.dataset.targetDir;
             const sources = [...state.draggedInternalPaths];
             const validSources = sources.filter(s => s !== targetPath);
             if (validSources.length > 0) {
               const action = upEvent.ctrlKey ? 'copy' : 'move';
               startTransferOperation(action, validSources, targetPath);
             }
          }
          
          state.draggedInternalPaths = [];
        }
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });

    // Mark as drop target if directory
    if (item.is_directory) {
      row.classList.add('drop-target');
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function ensureVisible(index) {
    if (index < 0) return;
    const row = el.fileList.children[index];
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleRowClick(e, index) {
    if (e.ctrlKey) {
      const item = state.filteredItems[index];
      if (state.selectedItems.has(item.path)) {
        state.selectedItems.delete(item.path);
      } else {
        state.selectedItems.add(item.path);
      }
      state.selectedIndex = index;
    } else if (e.shiftKey && state.selectedIndex >= 0) {
      const start = Math.min(state.selectedIndex, index);
      const end = Math.max(state.selectedIndex, index);
      state.selectedItems.clear();
      for (let i = start; i <= end; i++) {
        state.selectedItems.add(state.filteredItems[i].path);
      }
    } else {
      state.selectedItems.clear();
      state.selectedIndex = index;
      state.selectedItems.add(state.filteredItems[index].path);
    }
    renderFileList();
    updateStatusBar();
  }

  function openInTextEditor(filePath) {
    let editor = state.textEditor || 'notepad';
    if (editor === 'custom') {
      editor = state.textEditorCustomPath || 'notepad';
    }
    invoke('open_in_editor', { filePath, editor }).catch(err => {
      console.error(err);
      alert('Error al abrir editor: ' + err);
    });
  }

  function openCurrentTerminal() {
    if (!state.currentDirectory) return;
    let term = state.terminalApp || 'default';
    if (term === 'custom') {
      term = state.terminalCustomPath || 'default';
    }
    invoke('open_terminal', { path: state.currentDirectory, terminal: term }).catch(err => {
      console.error(err);
      alert('Error al abrir la terminal: ' + err);
    });
  }

  function activateItem(item) {
    if (!item) return;
    if (item.is_directory) {
      loadDirectory(item.path);
    } else {
      invoke('open_file_default', { path: item.path }).catch(err => {
        alert('Error al abrir archivo: ' + err);
      });
    }
  }

  function updateStatusBar() {
    el.statusItemCount.textContent = `${state.filteredItems.length} elemento${state.filteredItems.length === 1 ? '' : 's'}`;
    const selCount = state.selectedItems.size;
    if (selCount === 0) {
      el.statusSelection.textContent = 'Ningún elemento seleccionado';
    } else if (selCount === 1 && state.selectedIndex >= 0) {
      const item = state.filteredItems[state.selectedIndex];
      el.statusSelection.textContent = `${item.name} (${item.is_directory ? 'Carpeta' : formatSize(item.size)})`;
    } else {
      el.statusSelection.textContent = `${selCount} seleccionados`;
    }
  }

  // QuickView Controller
  async function openQuickView() {
    if (state.selectedIndex < 0 || state.selectedIndex >= state.filteredItems.length) return;
    const item = state.filteredItems[state.selectedIndex];

    state.quickViewOpen = true;
    el.quickViewModal.classList.remove('hidden');
    await loadQuickViewContent(item);
  }

  function closeQuickView() {
    state.quickViewOpen = false;
    state.activeDirCalcId = null; // Abort any in-progress directory calculation immediately
    cleanupMedia();
    el.quickViewModal.classList.add('hidden');
    el.qvContent.innerHTML = '';
    el.fileList.focus();
  }

  function cleanupMedia() {
    const media = el.qvContent.querySelector('audio, video');
    if (media) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
  }

  async function loadQuickViewContent(item) {
    cleanupMedia();
    state.activeDirCalcId = Date.now();
    const currentCalcId = state.activeDirCalcId;

    el.qvTitle.textContent = item.name;
    el.qvIcon.textContent = getFileIcon(item);
    el.qvBadge.textContent = item.is_directory ? 'CARPETA' : (item.extension || item.file_type || 'archivo').toUpperCase();
    if (el.qvDetails) {
      el.qvDetails.textContent = item.is_directory
        ? `Carpeta | Modificado: ${formatDate(item.modified)}`
        : `Tamaño: ${formatSize(item.size)} | Modificado: ${formatDate(item.modified)}`;
    }
    el.qvContent.innerHTML = `<div class="text-xs text-gnome-textDim">Cargando vista previa...</div>`;

    if (item.is_directory) {
      await renderFolderQuickView(item, currentCalcId);
      return;
    }

    let previewMeta = null;
    try {
      previewMeta = await invoke('read_file_preview', {
        path: item.path,
        customTextExts: state.customTextExts
      });
    } catch (e) {
      renderFallbackCard(item, 'Error al obtener información del archivo: ' + e);
      return;
    }

    if (!state.quickViewOpen) return; // User closed quickview in the meantime

    if (!previewMeta) {
      renderFallbackCard(item, 'No se pudo generar la vista previa.');
      return;
    }

    if (previewMeta.is_too_large) {
      renderFallbackCard(item, `El archivo supera el límite de vista previa (${formatSize(previewMeta.max_size_bytes)})`);
      return;
    }

    if (previewMeta.error_message) {
      renderFallbackCard(item, previewMeta.error_message);
      return;
    }

    const dataUrl = previewMeta.data_url;

    switch (previewMeta.file_type) {
      case 'image':
        renderImagePreview(item, dataUrl);
        break;
      case 'pdf':
        renderPdfPreview(item, dataUrl);
        break;
      case 'audio':
        renderAudioPreview(item, dataUrl, previewMeta.mime_type);
        break;
      case 'video':
        renderVideoPreview(item, dataUrl, previewMeta.mime_type);
        break;
      case 'text':
        renderTextPreview(item, previewMeta);
        break;
      case 'office':
        renderOfficePreview(item, previewMeta);
        break;
      default:
        renderFallbackCard(item, null);
        break;
    }
  }

  async function renderFolderQuickView(item, calcId) {
    el.qvContent.innerHTML = `
      <div class="w-full max-w-md bg-gnome-sidebar border border-gnome-border rounded-xl p-6 flex flex-col items-center gap-4 text-center shadow-lg">
        <div class="text-6xl text-amber-400">📁</div>
        <div class="font-semibold text-sm text-gnome-text truncate max-w-xs">${escapeHtml(item.name)}</div>
        <div id="qvDirCalcStatus" class="text-xs text-gnome-active flex items-center gap-1.5 animate-pulse">
          <span>⏳</span> Calculando tamaño y contenido...
        </div>
        <div class="w-full border-t border-gnome-border/50 mt-2 pt-3 text-[11px] text-gnome-textDim flex flex-col gap-1.5 text-left">
          <div id="qvDirStats" class="space-y-1">
            <div><span class="text-gnome-text font-medium">Ruta:</span> <span class="break-all">${escapeHtml(item.path)}</span></div>
            <div><span class="text-gnome-text font-medium">Modificado:</span> ${formatDate(item.modified)}</div>
          </div>
        </div>
      </div>
    `;

    try {
      const res = await invoke('get_directory_size', { path: item.path });
      // Check if this calculation was cancelled (e.g. user navigated or closed with Esc)
      if (state.activeDirCalcId !== calcId || !state.quickViewOpen) {
        return;
      }

      // Cache size
      state.dirSizes.set(item.path, res);

      const statusEl = document.getElementById('qvDirCalcStatus');
      const statsEl = document.getElementById('qvDirStats');
      if (statusEl) {
        statusEl.className = 'text-xs text-emerald-400 flex items-center gap-1.5';
        statusEl.innerHTML = `<span>✔️</span> ${formatSize(res.total_size)} en total`;
      }
      if (statsEl) {
        statsEl.innerHTML = `
          <div><span class="text-gnome-text font-medium">Tamaño total:</span> ${formatSize(res.total_size)}</div>
          <div><span class="text-gnome-text font-medium">Archivos contenidos:</span> ${res.file_count.toLocaleString()}</div>
          <div><span class="text-gnome-text font-medium">Subdirectorios:</span> ${res.dir_count.toLocaleString()}</div>
          <div><span class="text-gnome-text font-medium">Modificado:</span> ${formatDate(item.modified)}</div>
          <div><span class="text-gnome-text font-medium">Ruta:</span> <span class="break-all">${escapeHtml(item.path)}</span></div>
        `;
      }
      if (el.qvDetails) {
        el.qvDetails.textContent = `Tamaño: ${formatSize(res.total_size)} | ${res.file_count} archivos, ${res.dir_count} carpetas`;
      }
    } catch (err) {
      if (state.activeDirCalcId !== calcId || !state.quickViewOpen) return;
      const statusEl = document.getElementById('qvDirCalcStatus');
      if (statusEl) {
        statusEl.className = 'text-xs text-red-400';
        statusEl.textContent = 'No se pudo calcular el tamaño: ' + err;
      }
    }
  }

  function renderImagePreview(item, dataUrl) {
    if (!dataUrl) {
      renderFallbackCard(item, 'No se pudo cargar los datos de la imagen');
      return;
    }
    el.qvContent.innerHTML = `
      <div class="w-full h-full flex flex-col items-center justify-center p-2">
        <img src="${dataUrl}" alt="${escapeHtml(item.name)}" class="max-w-full max-h-[70vh] object-contain rounded shadow" onerror="this.onerror=null; window._tronFallbackImage('${escapeHtml(item.name)}', '${escapeHtml(item.extension || '')}')"/>
      </div>
    `;
  }

  function renderPdfPreview(item, dataUrl) {
    if (!dataUrl) {
      renderFallbackCard(item, 'No se pudo cargar el documento PDF');
      return;
    }
    el.qvContent.innerHTML = `
      <div class="w-full h-full min-h-[60vh] flex flex-col p-1">
        <iframe src="${dataUrl}#toolbar=1" class="w-full h-[65vh] rounded-lg border border-gnome-border bg-white" title="${escapeHtml(item.name)}"></iframe>
      </div>
    `;
  }

  window._tronFallbackImage = function(name, ext) {
    const msg = `No se pudo renderizar la imagen directamente en el visor. Pulsa 'Abrir' para verla en la aplicación predeterminada.`;
    renderFallbackCard({ name, extension: ext, file_type: 'image' }, msg);
  };

  function renderTextPreview(item, previewMeta) {
    const content = previewMeta && previewMeta.content ? previewMeta.content : '';
    const ext = (item.extension || '').toLowerCase();
    const highlighted = highlightCodeContent(content, ext);

    el.qvContent.innerHTML = `
      <div class="w-full h-full max-h-[70vh] overflow-auto bg-gnome-sidebar border border-gnome-border rounded p-4">
        <pre class="font-mono text-xs text-gnome-text whitespace-pre-wrap leading-relaxed select-text">${highlighted}</pre>
      </div>
    `;
  }

  function highlightCodeContent(text, ext) {
    if (!text) return '';
    if (ext === 'json') {
      return highlightJson(text);
    } else if (ext === 'py') {
      return highlightPython(text);
    } else if (ext === 'md') {
      return highlightMarkdown(text);
    } else if (ext === 'sql') {
      return highlightSql(text);
    } else if (['js', 'ts', 'rs', 'yaml', 'yml', 'c', 'cpp', 'h', 'hpp', 'sh', 'bat', 'ps1', 'str'].includes(ext)) {
      return highlightGenericCode(text);
    }
    // Plain text or custom text extension
    return escapeHtml(text);
  }

  function highlightSql(text) {
    const lines = text.split('\n');
    const keywords = new Set(['select', 'from', 'where', 'insert', 'into', 'update', 'delete', 'create', 'table', 'drop', 'alter', 'join', 'inner', 'left', 'right', 'outer', 'on', 'group', 'by', 'order', 'having', 'limit', 'offset', 'as', 'and', 'or', 'not', 'null', 'is', 'in', 'values', 'set', 'distinct', 'case', 'when', 'then', 'else', 'end', 'primary', 'key', 'foreign', 'references', 'index', 'view', 'trigger', 'database', 'union', 'all']);
    return lines.map(line => {
      let escaped = escapeHtml(line);
      const commentIdx = escaped.indexOf('--');
      let codePart = escaped;
      let commentPart = '';
      if (commentIdx >= 0) {
        codePart = escaped.slice(0, commentIdx);
        commentPart = `<span class="syn-comment">${escaped.slice(commentIdx)}</span>`;
      }
      codePart = codePart.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="syn-string">$&</span>');
      codePart = codePart.replace(/\b([a-zA-Z_]\w*)\b/g, (match, word) => {
        if (keywords.has(word.toLowerCase())) return `<span class="syn-keyword">${word}</span>`;
        return match;
      });
      codePart = codePart.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syn-number">$1</span>');
      return codePart + commentPart;
    }).join('\n');
  }

  function highlightJson(jsonStr) {
    let escaped = escapeHtml(jsonStr);
    return escaped.replace(
      /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      function(match) {
        let cls = 'syn-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'syn-key';
          } else {
            cls = 'syn-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'syn-boolean';
        } else if (/null/.test(match)) {
          cls = 'syn-keyword';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }

  function highlightPython(text) {
    const lines = text.split('\n');
    const keywords = new Set(['def', 'class', 'import', 'from', 'as', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'try', 'except', 'finally', 'with', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'is', 'None', 'True', 'False', 'async', 'await']);
    return lines.map(line => {
      let escaped = escapeHtml(line);
      // Comment
      const commentIdx = escaped.indexOf('#');
      let codePart = escaped;
      let commentPart = '';
      if (commentIdx >= 0) {
        codePart = escaped.slice(0, commentIdx);
        commentPart = `<span class="syn-comment">${escaped.slice(commentIdx)}</span>`;
      }

      // Strings (single and double quotes)
      codePart = codePart.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="syn-string">$&</span>');

      // Keywords
      codePart = codePart.replace(/\b([a-zA-Z_]\w*)\b/g, (match, word) => {
        if (keywords.has(word)) {
          return `<span class="syn-keyword">${word}</span>`;
        }
        return match;
      });

      // Numbers
      codePart = codePart.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syn-number">$1</span>');

      return codePart + commentPart;
    }).join('\n');
  }

  function highlightMarkdown(text) {
    const lines = text.split('\n');
    return lines.map(line => {
      let escaped = escapeHtml(line);
      // Headings
      if (/^#{1,6}\s/.test(escaped)) {
        return `<span class="syn-heading">${escaped}</span>`;
      }
      // Lists
      if (/^(\s*[-*+]|\s*\d+\.)\s/.test(escaped)) {
        return `<span class="syn-list">${escaped}</span>`;
      }
      // Inline code
      escaped = escaped.replace(/`([^`]+)`/g, '<span class="syn-string bg-gnome-bg/60 px-1 py-0.5 rounded font-mono">`$1`</span>');
      // Bold / Italic
      escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-gnome-text">$1</strong>');
      return escaped;
    }).join('\n');
  }

  function highlightGenericCode(text) {
    const lines = text.split('\n');
    const keywords = new Set(['fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'use', 'const', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'export', 'type', 'interface', 'async', 'await', 'true', 'false']);
    return lines.map(line => {
      let escaped = escapeHtml(line);
      // Comments (//)
      const commentIdx = escaped.indexOf('//');
      let codePart = escaped;
      let commentPart = '';
      if (commentIdx >= 0) {
        codePart = escaped.slice(0, commentIdx);
        commentPart = `<span class="syn-comment">${escaped.slice(commentIdx)}</span>`;
      }

      codePart = codePart.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '<span class="syn-string">$&</span>');
      codePart = codePart.replace(/\b([a-zA-Z_]\w*)\b/g, (match, word) => {
        if (keywords.has(word)) return `<span class="syn-keyword">${word}</span>`;
        return match;
      });
      codePart = codePart.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="syn-number">$1</span>');

      return codePart + commentPart;
    }).join('\n');
  }

  function renderAudioPreview(item, dataUrl, mimeType) {
    if (!dataUrl) {
      renderFallbackCard(item, 'No se pudo cargar el archivo de audio');
      return;
    }
    el.qvContent.innerHTML = `
      <div class="w-full max-w-md bg-gnome-sidebar border border-gnome-border rounded-xl p-6 flex flex-col items-center gap-4 shadow-lg">
        <div class="w-20 h-20 rounded-full bg-gnome-active/20 flex items-center justify-center text-4xl text-gnome-active">
          🎵
        </div>
        <div class="text-center">
          <div class="font-semibold text-sm text-gnome-text truncate max-w-xs">${escapeHtml(item.name)}</div>
          <div class="text-xs text-gnome-textDim mt-1">${formatSize(item.size)}</div>
        </div>
        <audio id="qvAudioPlayer" controls autoplay class="w-full mt-2 outline-none">
          <source src="${dataUrl}" type="${mimeType || 'audio/mpeg'}">
          Tu entorno no soporta reproducción de audio.
        </audio>
      </div>
    `;

    const audio = document.getElementById('qvAudioPlayer');
    if (audio) {
      audio.onerror = () => {
        renderFallbackCard(item, "Vista previa no disponible para este formato o códec de audio.");
      };
    }
  }

  function renderVideoPreview(item, dataUrl, mimeType) {
    if (!dataUrl) {
      renderFallbackCard(item, 'No se pudo cargar el archivo de vídeo');
      return;
    }
    el.qvContent.innerHTML = `
      <div class="w-full h-full flex flex-col items-center justify-center max-h-[70vh]">
        <video id="qvVideoPlayer" controls autoplay preload="metadata" playsinline class="max-w-full max-h-[65vh] rounded-lg shadow-lg border border-gnome-border bg-black">
          <source src="${dataUrl}" type="${mimeType || 'video/mp4'}">
          Tu entorno no soporta reproducción de vídeo.
        </video>
      </div>
    `;

    const video = document.getElementById('qvVideoPlayer');
    if (video) {
      video.onerror = () => {
        renderFallbackCard(item, "Vista previa no disponible para este formato o códec de vídeo. Pulsa 'Abrir' para reproducirlo en tu reproductor predeterminado.");
      };
    }
  }

  function renderOfficePreview(item, previewMeta) {
    const ext = (item.extension || '').toLowerCase();
    const content = previewMeta ? previewMeta.content : null;
    const dataUrl = previewMeta ? previewMeta.data_url : null;

    let officeType = 'Documento';
    let officeIcon = '📝';
    let officeBadgeBg = 'bg-blue-600/20 text-blue-400 border-blue-500/30';
    if (['docx', 'doc', 'docm', 'dotx', 'dot', 'odt', 'rtf'].includes(ext)) {
      officeType = 'Documento Microsoft Word';
      officeIcon = '📘';
      officeBadgeBg = 'bg-blue-600/20 text-blue-400 border-blue-500/30';
    } else if (['xlsx', 'xls', 'xlsm', 'xlsb', 'xltx', 'xlt', 'ods'].includes(ext)) {
      officeType = 'Hoja de cálculo Microsoft Excel';
      officeIcon = '📊';
      officeBadgeBg = 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30';
    } else if (['pptx', 'ppt', 'pptm', 'potx', 'pot', 'odp'].includes(ext)) {
      officeType = 'Presentación Microsoft PowerPoint';
      officeIcon = '📙';
      officeBadgeBg = 'bg-amber-600/20 text-amber-400 border-amber-500/30';
    }

    if (content) {
      el.qvContent.innerHTML = `
        <div class="w-full h-full flex flex-col p-1 max-h-[72vh] overflow-hidden">
          <div class="flex items-center justify-between px-3 py-2 bg-gnome-sidebar border border-gnome-border rounded-t-lg">
            <div class="flex items-center gap-2 ${officeBadgeBg} border px-2.5 py-1 rounded-md text-xs font-medium">
              <span class="text-sm">${officeIcon}</span> <span>${officeType}</span>
            </div>
            <div class="text-[11px] text-gnome-textDim flex items-center gap-2">
              <span>📄 Vista de contenido</span>
            </div>
          </div>
          <div class="flex-1 overflow-auto bg-gnome-surface border-x border-b border-gnome-border rounded-b-lg p-5 shadow-inner">
            ${content}
          </div>
        </div>
      `;
    } else if (dataUrl) {
      el.qvContent.innerHTML = `
        <div class="w-full h-full flex flex-col items-center justify-center p-2 max-h-[72vh]">
          <div class="relative max-h-[68vh] flex items-center justify-center bg-gnome-sidebar border border-gnome-border rounded-xl p-3 shadow-2xl overflow-hidden">
            <img src="${dataUrl}" alt="${escapeHtml(item.name)}" class="max-w-full max-h-[62vh] object-contain rounded-lg shadow-md bg-white"/>
            <div class="absolute top-4 left-4 ${officeBadgeBg} border text-[11px] font-medium px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-lg backdrop-blur-md">
              <span class="text-sm">${officeIcon}</span> <span>${officeType}</span>
            </div>
          </div>
        </div>
      `;
    } else {
      renderFallbackCard(item, `No se pudo extraer la vista previa de este documento de Office. Pulsa 'Abrir' para visualizarlo en su aplicación predeterminada.`);
    }
  }

  function renderFallbackCard(item, customMsg) {
    cleanupMedia();
    const msg = customMsg || 'Vista previa no disponible para este tipo de archivo.';
    el.qvContent.innerHTML = `
      <div class="w-full max-w-md bg-gnome-sidebar border border-gnome-border rounded-xl p-6 flex flex-col items-center gap-3 text-center shadow-lg">
        <div class="text-5xl mb-1">${getFileIcon(item)}</div>
        <div class="font-semibold text-sm text-gnome-text truncate max-w-xs">${escapeHtml(item.name)}</div>
        <div class="text-xs text-amber-400/90 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-md mt-1 max-w-sm">
          ${escapeHtml(msg)}
        </div>
        <div class="w-full border-t border-gnome-border/50 mt-3 pt-3 text-[11px] text-gnome-textDim flex flex-col gap-1 text-left">
          <div><span class="text-gnome-text font-medium">Extensión:</span> .${escapeHtml(item.extension || 'desconocida')}</div>
          <div><span class="text-gnome-text font-medium">Tamaño:</span> ${formatSize(item.size)}</div>
          <div><span class="text-gnome-text font-medium">Modificado:</span> ${formatDate(item.modified)}</div>
          <div><span class="text-gnome-text font-medium">Ruta:</span> <span class="break-all">${escapeHtml(item.path)}</span></div>
        </div>
      </div>
    `;
  }

  // Quick Purge: Delete (Trash) Operation
  async function deleteCurrentItem() {
    const pathsToDelete = getSelectedOrFocusedPaths();
    if (pathsToDelete.length === 0) return;

    try {
      cleanupMedia();
      for (const path of pathsToDelete) {
        await invoke('delete_file_item', { path });
      }

      // Refresh directory list preserving QuickView
      const res = await invoke('read_directory', { path: state.currentDirectory });
      if (res) {
        state.items = res.items || [];
        applyFilter();
      }

      if (state.filteredItems.length === 0) {
        // No more items left
        if (state.quickViewOpen) closeQuickView();
        state.selectedIndex = -1;
        state.selectedItems.clear();
        renderFileList();
        updateStatusBar();
      } else {
        // Keep index clamped
        if (state.selectedIndex >= state.filteredItems.length) {
          state.selectedIndex = state.filteredItems.length - 1;
        }
        state.selectedItems.clear();
        state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
        renderFileList();
        updateStatusBar();

        if (state.quickViewOpen) {
          await loadQuickViewContent(state.filteredItems[state.selectedIndex]);
        }
      }
    } catch (err) {
      alert('Error al mover a la papelera: ' + err);
    }
  }

  // Keyboard Navigation Handling
  function handleGlobalKeyDown(e) {
    const activeEl = document.activeElement;
    const isInputActive = activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName);

    // If focus is inside a modal or text field
    if (isInputActive) {
      if (activeEl === el.searchInput) {
        if (e.key === 'Escape') {
          el.searchInput.value = '';
          state.searchQuery = '';
          el.btnClearSearch.classList.add('hidden');
          applyFilter();
          state.selectedIndex = state.filteredItems.length > 0 ? 0 : -1;
          state.selectionAnchor = state.selectedIndex;
          state.selectedItems.clear();
          if (state.selectedIndex >= 0) {
            state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
          }
          renderFileList();
          updateStatusBar();
          el.fileList.focus();
          e.preventDefault();
        }
        return;
      }

      // If in any modal input (New File, New Folder, Network UNC, Appearance, Rename Fav, Rename Item, Compress, Open With)
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNewFileModal();
        closeNewFolderModal();
        closeNetworkModal();
        closeHelpModal();
        closeAboutModal();
        closeAppearanceModal();
        closeRenameFavoriteModal();
        closeRenameItemModal();
        closeConfirmExitModal();
        closeSherlockModal();
        closeOpenWithModal();
        closeCompressModal();
        closeArchiveViewModal();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeEl === el.inputNetworkPath) {
          confirmNetwork();
        } else if (activeEl === el.inputNewFileName) {
          confirmNewFile();
        } else if (activeEl === el.inputNewFolderName) {
          confirmNewFolder();
        } else if (activeEl === el.inputRenameFavName) {
          saveRenamedFavorite();
        } else if (activeEl === el.inputRenameItemName) {
          saveRenamedItem();
        } else if (activeEl === el.inputCompressName) {
          confirmCompress();
        } else if (activeEl === el.inputOpenWithApp) {
          launchCustomOpenWith();
        } else if (activeEl === el.inputSherlockQuery || activeEl === el.inputSherlockSizeNum) {
          executeSherlockFromInputs();
        }
        return;
      }

      // Allow typing and editing without triggering hotkeys (backspace, enter, letters)
      return;
    }

    // QuickView specific keys
    if (state.quickViewOpen) {
      // If focus is inside media player (audio/video controls), respect space for play/pause
      const isMediaFocused = activeEl && ['AUDIO', 'VIDEO'].includes(activeEl.tagName);

      if (e.key === ' ' || e.code === 'Space') {
        if (!isMediaFocused) {
          e.preventDefault();
          closeQuickView();
          return;
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        closeQuickView();
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        deleteCurrentItem();
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateQuickView(1);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateQuickView(-1);
        return;
      }

      return; // Do not process normal list navigation while QuickView is open
    }

    // Normal Window Navigation
    if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      state.selectedItems.clear();
      state.filteredItems.forEach(i => state.selectedItems.add(i.path));
      renderFileList();
      updateStatusBar();
      return;
    }

    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      copySelectedItems();
      return;
    }

    if (e.ctrlKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      cutSelectedItems();
      return;
    }

    if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      pasteClipboardItems();
      return;
    }

    if (e.ctrlKey && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      openNewFolderModal();
      return;
    }

    if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      openNewFileModal();
      return;
    }

    if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      duplicateSelectedItem();
      return;
    }

    if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      addCurrentToFavorites();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (el.searchInput) {
        el.searchInput.focus();
        el.searchInput.select();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      openSherlockModal();
      return;
    }

    if (e.key === 'F2') {
      e.preventDefault();
      openRenameItemModal();
      return;
    }

    if (e.altKey && e.key === 'Enter') {
      e.preventDefault();
      showItemProperties();
      return;
    }

    if (e.ctrlKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      toggleShowHiddenFiles();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      openCurrentTerminal();
      return;
    }

    if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
      e.preventDefault();
      loadDirectory(state.currentDirectory, false);
      return;
    }

    if (e.key === 'F1') {
      e.preventDefault();
      openHelpModal();
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      openQuickView();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        activateItem(state.filteredItems[state.selectedIndex]);
      }
      return;
    }

    if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) {
      e.preventDefault();
      goBack();
      return;
    }

    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      goForward();
      return;
    }

    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      goUp();
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      deleteCurrentItem();
      return;
    }

    // Continuous Range Selection with Shift + Arrow Keys
    if (e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelectionWithShift(1);
      return;
    }

    if (e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelectionWithShift(-1);
      return;
    }

    // Standard Arrow Navigation
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        activateItem(state.filteredItems[state.selectedIndex]);
      }
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      setSelectionIndex(0);
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      setSelectionIndex(state.filteredItems.length - 1);
      return;
    }

    if (e.key === 'PageDown') {
      e.preventDefault();
      moveSelection(10);
      return;
    }

    if (e.key === 'PageUp') {
      e.preventDefault();
      moveSelection(-10);
      return;
    }

    // Single-key Alphanumeric Type-Ahead Navigation (Jumping to file starting with letter/digit)
    if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1 && /^[a-zA-Z0-9]$/.test(e.key)) {
      e.preventDefault();
      jumpToNextItemStartingWith(e.key);
      return;
    }
  }

  function jumpToNextItemStartingWith(char) {
    if (state.filteredItems.length === 0) return;
    const lowerChar = char.toLowerCase();
    const count = state.filteredItems.length;
    const startIndex = (state.selectedIndex + 1) % count;

    for (let i = 0; i < count; i++) {
      const idx = (startIndex + i) % count;
      const name = state.filteredItems[idx].name.toLowerCase();
      if (name.startsWith(lowerChar)) {
        setSelectionIndex(idx);
        break;
      }
    }
  }

  function moveSelectionWithShift(delta) {
    if (state.filteredItems.length === 0) return;
    if (state.selectionAnchor < 0) {
      state.selectionAnchor = state.selectedIndex >= 0 ? state.selectedIndex : 0;
    }

    let next = (state.selectedIndex >= 0 ? state.selectedIndex : 0) + delta;
    if (next < 0) next = 0;
    if (next >= state.filteredItems.length) next = state.filteredItems.length - 1;

    state.selectedIndex = next;
    state.selectedItems.clear();

    const start = Math.min(state.selectionAnchor, next);
    const end = Math.max(state.selectionAnchor, next);
    for (let i = start; i <= end; i++) {
      state.selectedItems.add(state.filteredItems[i].path);
    }

    renderFileList();
    updateStatusBar();
  }

  function moveSelection(delta) {
    if (state.filteredItems.length === 0) return;
    let next = state.selectedIndex + delta;
    if (next < 0) next = 0;
    if (next >= state.filteredItems.length) next = state.filteredItems.length - 1;
    state.selectionAnchor = next;
    setSelectionIndex(next);
  }

  function setSelectionIndex(idx) {
    if (idx < 0 || idx >= state.filteredItems.length) return;
    state.selectedIndex = idx;
    state.selectionAnchor = idx;
    state.selectedItems.clear();
    state.selectedItems.add(state.filteredItems[idx].path);
    renderFileList();
    updateStatusBar();
  }

  async function navigateQuickView(delta) {
    if (state.filteredItems.length === 0) return;
    let next = state.selectedIndex + delta;
    if (next < 0) next = 0;
    if (next >= state.filteredItems.length) next = state.filteredItems.length - 1;
    if (next === state.selectedIndex) return; // Reached boundary

    state.selectedIndex = next;
    state.selectedItems.clear();
    state.selectedItems.add(state.filteredItems[next].path);
    renderFileList();
    updateStatusBar();
    await loadQuickViewContent(state.filteredItems[next]);
  }

  function goBack() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      loadDirectory(state.history[state.historyIndex], false);
    }
  }

  function goForward() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      loadDirectory(state.history[state.historyIndex], false);
    }
  }

  function goUp() {
    if (!state.currentDirectory) return;
    let norm = state.currentDirectory.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!norm) return;
    const lastSlash = norm.lastIndexOf('/');
    if (lastSlash > 0) {
      let parent = norm.substring(0, lastSlash);
      if (parent.length === 2 && parent.endsWith(':')) {
        parent += '\\';
      }
      loadDirectory(parent);
    } else if (lastSlash === 0) {
      loadDirectory('/');
    }
  }

  // Clipboard & File Operations
  function getSelectedOrFocusedPaths() {
    if (state.selectedItems.size > 0) {
      return Array.from(state.selectedItems);
    }
    if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
      return [state.filteredItems[state.selectedIndex].path];
    }
    return [];
  }

  function copySelectedItems() {
    const paths = getSelectedOrFocusedPaths();
    if (paths.length === 0) return;
    state.clipboard = { action: 'copy', paths };
    updateClipboardUI();
    renderFileList();
  }

  function cutSelectedItems() {
    const paths = getSelectedOrFocusedPaths();
    if (paths.length === 0) return;
    state.clipboard = { action: 'cut', paths };
    updateClipboardUI();
    renderFileList();
  }

  async function pasteClipboardItems() {
    if (!state.clipboard.action || state.clipboard.paths.length === 0 || !state.currentDirectory) {
      return;
    }

    const action = state.clipboard.action;
    const sources = [...state.clipboard.paths];
    const targetDir = state.currentDirectory;

    if (action === 'cut') {
      state.clipboard = { action: null, paths: [] };
      updateClipboardUI();
    }

    startTransferOperation(action, sources, targetDir);
  }

  // --- Multi-Task Transfer Progress & Manager ---
  async function startTransferOperation(action, sources, targetDir) {
    try {
      const command = action === 'copy' ? 'copy_items' : 'move_items';
      await invoke(command, {
        sources,
        targetDirectory: targetDir
      });
      // Do not create a UI task, we rely on native Windows Shell Dialog!
    } catch (err) {
      alert(`Error al iniciar ${action === 'copy' ? 'copia' : 'movimiento'}: ` + err);
    }
  }

  function formatEta(seconds) {
    if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
    if (seconds < 60) return `Quedan ${Math.round(seconds)} s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins < 60) {
      return `Quedan ${mins}m ${secs.toString().padStart(2, '0')}s`;
    }
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `Quedan ${hours}h ${remMins}m`;
  }

  function handleTransferProgress(payload) {
    if (!payload || !payload.operation_id) return;
    let task = state.activeTransfers.get(payload.operation_id);
    if (!task) {
      task = {
        id: payload.operation_id,
        action: payload.action || 'copy',
        sources: [],
        targetDir: payload.target_directory || state.currentDirectory,
        startTime: performance.now(),
        isDone: false,
        success: true,
        error: null
      };
      state.activeTransfers.set(payload.operation_id, task);
    }

    task.currentItem = payload.current_item || '';
    task.currentIndex = payload.current_index || 0;
    task.totalItems = payload.total_items || 1;
    task.bytesCopied = payload.bytes_copied || 0;
    task.totalBytes = payload.total_bytes || 0;
    task.targetDir = payload.target_directory || task.targetDir;

    // Use speed and eta from backend or compute locally if needed
    if (payload.speed_bytes_per_sec && payload.speed_bytes_per_sec > 0) {
      task.speed = `${formatSize(payload.speed_bytes_per_sec)}/s`;
      task.eta = formatEta(payload.eta_seconds);
    } else {
      const elapsedSec = (performance.now() - task.startTime) / 1000;
      if (elapsedSec > 0.3 && task.bytesCopied > 0) {
        const bytesPerSec = task.bytesCopied / elapsedSec;
        task.speed = `${formatSize(bytesPerSec)}/s`;
        if (task.totalBytes > task.bytesCopied) {
          const remSecs = (task.totalBytes - task.bytesCopied) / bytesPerSec;
          task.eta = formatEta(remSecs);
        }
      }
    }

    renderAllTransfersUI();
  }

  function handleTransferFinished(payload) {
    if (!payload || !payload.operation_id) return;
    const task = state.activeTransfers.get(payload.operation_id);
    if (task) {
      task.isDone = true;
      task.success = payload.success;
      task.error = payload.error;
      task.currentIndex = payload.items_count || task.totalItems;
      task.bytesCopied = payload.total_bytes || task.totalBytes;
      task.speed = payload.success ? 'Completado' : 'Error';
      task.eta = '';
    }

    renderAllTransfersUI();

    // Auto-reload current directory if user is inside the target folder OR if it was a move operation
    if (state.currentDirectory) {
      const curNorm = state.currentDirectory.toLowerCase().replace(/\\/g, '/');
      const targetNorm = (payload.target_directory || '').toLowerCase().replace(/\\/g, '/');
      
      // If we are in the target directory, or if it was a 'move' operation (where sources were removed from current dir)
      if (curNorm === targetNorm || payload.action === 'move' || payload.action === 'copy') {
        loadDirectory(state.currentDirectory, false);
      }
    }

    // Auto-remove completed tasks immediately
    setTimeout(() => {
      state.activeTransfers.delete(payload.operation_id);
      renderAllTransfersUI();
    }, 0);
  }

  function renderAllTransfersUI() {
    const tasks = Array.from(state.activeTransfers.values());
    if (tasks.length === 0) {
      hidePasteProgress();
      return;
    }

    if (!el.pasteProgressContainer) return;
    el.pasteProgressContainer.classList.remove('hidden');
    el.pasteProgressContainer.classList.add('flex');

    const activeTasks = tasks.filter(t => !t.isDone);
    const activeCount = activeTasks.length;

    // 1. Overall Header Indicator
    if (activeCount > 1) {
      if (el.pasteProgressLabel) el.pasteProgressLabel.textContent = `${activeCount} tareas`;
    } else if (activeCount === 1) {
      const t = activeTasks[0];
      const label = t.action === 'copy' ? 'Copiando' : 'Moviendo';
      const detail = t.speed && t.speed !== 'Calculando...' ? ` (${t.speed})` : '';
      if (el.pasteProgressLabel) el.pasteProgressLabel.textContent = `${label}${detail}`;
    } else {
      if (el.pasteProgressLabel) el.pasteProgressLabel.textContent = 'Completado';
    }

    // Calculate aggregated percentage
    let totalPct = 0;
    tasks.forEach(t => {
      let p = 0;
      if (t.isDone) {
        p = 100;
      } else if (t.totalBytes > 0) {
        p = Math.min(99, Math.round((t.bytesCopied / t.totalBytes) * 100));
      } else if (t.totalItems > 0) {
        p = Math.min(99, Math.round((t.currentIndex / t.totalItems) * 100));
      }
      totalPct += p;
    });
    const avgPct = Math.round(totalPct / tasks.length);

    if (el.pasteProgressBar) el.pasteProgressBar.style.width = `${avgPct}%`;
    if (el.pasteProgressPercent) el.pasteProgressPercent.textContent = `${avgPct}%`;

    // 2. Render List of Tasks inside pasteDetailsCard
    if (el.pasteTasksList) {
      el.pasteTasksList.innerHTML = '';
      tasks.forEach(t => {
        let taskPct = 0;
        if (t.isDone) {
          taskPct = 100;
        } else if (t.totalBytes > 0) {
          taskPct = Math.min(99, Math.round((t.bytesCopied / t.totalBytes) * 100));
        } else if (t.totalItems > 0) {
          taskPct = Math.min(99, Math.round((t.currentIndex / t.totalItems) * 100));
        }

        const taskDiv = document.createElement('div');
        taskDiv.className = 'p-3 rounded-lg bg-gnome-sidebar/70 border border-gnome-border space-y-2';

        const actionText = t.action === 'copy' ? 'Copia' : 'Movimiento';
        const statusBadge = t.isDone
          ? (t.success ? '<span class="text-emerald-400 font-medium">✓ Listo</span>' : '<span class="text-red-400 font-medium">✕ Error</span>')
          : `<span class="text-blue-400 font-semibold">${t.speed || 'En progreso'}</span>`;

        const etaBadge = (!t.isDone && t.eta) ? `<span class="text-gnome-textDim text-[10px] ml-1.5 font-normal">⏱️ ${escapeHtml(t.eta)}</span>` : '';

        const bytesInfo = (t.totalBytes > 0)
          ? `${formatSize(t.bytesCopied)} de ${formatSize(t.totalBytes)}`
          : `${t.currentIndex} de ${t.totalItems} elementos`;

        taskDiv.innerHTML = `
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-gnome-text truncate max-w-[200px]" title="${escapeHtml(t.currentItem || 'Procesando...')}">
              ${actionText}: ${escapeHtml(t.currentItem || 'Archivos')}
            </span>
            <div class="flex items-center gap-1 shrink-0">
              ${statusBadge}
            </div>
          </div>
          <div class="w-full h-2.5 bg-gnome-bg rounded-full overflow-hidden border border-gnome-border/60">
            <div class="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full transition-all duration-150" style="width: ${taskPct}%"></div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-gnome-textDim">
            <span>${bytesInfo}${etaBadge}</span>
            <span class="font-bold text-gnome-active">${taskPct}%</span>
          </div>
          <div class="text-[10px] text-gnome-textDim truncate" title="Destino: ${escapeHtml(t.targetDir)}">
            📁 <span class="text-gnome-text">Destino:</span> ${escapeHtml(t.targetDir)}
          </div>
          ${t.error ? `<div class="text-[10px] text-red-400 font-mono bg-red-950/40 p-1 rounded border border-red-800/40">${escapeHtml(t.error)}</div>` : ''}
        `;
        el.pasteTasksList.appendChild(taskDiv);
      });
    }
  }

  function hidePasteProgress() {
    if (state.activeTransfers.size === 0) {
      if (el.pasteProgressContainer) {
        el.pasteProgressContainer.classList.remove('flex');
        el.pasteProgressContainer.classList.add('hidden');
      }
      if (el.pasteDetailsCard) {
        el.pasteDetailsCard.classList.add('hidden');
      }
    }
  }

  function updateClipboardUI() {
    const hasItems = state.clipboard.action && state.clipboard.paths.length > 0;
    el.btnActionPaste.disabled = !hasItems;
    el.menuPaste.disabled = !hasItems;

    if (hasItems) {
      const actionText = state.clipboard.action === 'copy' ? 'Copiado' : 'Cortado';
      el.clipboardBadge.textContent = `${actionText} ${state.clipboard.paths.length}`;
      el.clipboardBadge.classList.remove('hidden');
    } else {
      el.clipboardBadge.classList.add('hidden');
    }
  }

  async function duplicateSelectedItem(specificItem = null) {
    let targetPaths = [];
    if (specificItem) {
      targetPaths = [specificItem.path];
    } else {
      targetPaths = getSelectedOrFocusedPaths();
    }
    if (targetPaths.length === 0 || !state.currentDirectory) return;

    startTransferOperation('copy', targetPaths, state.currentDirectory);
  }

  // File Context Menu
  function openFileContextMenu(e, item, idx) {
    state.contextTargetItem = item;
    // If clicked item is not selected, select only it
    if (!state.selectedItems.has(item.path)) {
      state.selectedItems.clear();
      state.selectedIndex = idx;
      state.selectionAnchor = idx;
      state.selectedItems.add(item.path);
      renderFileList();
      updateStatusBar();
    }

    if (!el.fileContextMenu) return;

    const ext = (item.extension || '').toLowerCase();
    const isZip = ext === 'zip' || (item.name || '').toLowerCase().endsWith('.zip');

    if (el.ctxMenuExtractHere) {
      if (isZip) el.ctxMenuExtractHere.classList.remove('hidden');
      else el.ctxMenuExtractHere.classList.add('hidden');
    }

    if (el.ctxMenuExtractToFolder) {
      if (isZip) {
        el.ctxMenuExtractToFolder.classList.remove('hidden');
        const folderName = (item.name || 'archivo').replace(/\.zip$/i, '');
        if (el.ctxMenuExtractToFolderText) {
          el.ctxMenuExtractToFolderText.textContent = `📦 Extraer en ${folderName}/`;
        }
      } else {
        el.ctxMenuExtractToFolder.classList.add('hidden');
      }
    }

    if (el.ctxMenuArchiveViewContent) {
      if (isZip) el.ctxMenuArchiveViewContent.classList.remove('hidden');
      else el.ctxMenuArchiveViewContent.classList.add('hidden');
    }

    if (el.ctxMenuOpenEditor) {
      const isText = state.customTextExts.includes(ext) || item.file_type === 'text' || item.file_type === 'code' || !item.is_directory;
      if (isText && !item.is_directory) {
        el.ctxMenuOpenEditor.classList.remove('hidden');
      } else {
        el.ctxMenuOpenEditor.classList.add('hidden');
      }
    }

    if (el.ctxMenuOpenLocation) {
      if (item && item.path) {
        const isWindows = /^[a-zA-Z]:[\\\/]/.test(item.path) || item.path.startsWith('\\\\');
        const sep = isWindows ? '\\' : '/';
        const norm = isWindows ? item.path.replace(/\//g, '\\') : item.path.replace(/\\/g, '/');
        const lastSlash = norm.lastIndexOf(sep);
        if (lastSlash > 0) {
          const itemParent = norm.substring(0, lastSlash);
          const curNorm = isWindows ? (state.currentDirectory || '').replace(/\//g, '\\') : (state.currentDirectory || '').replace(/\\/g, '/');
          if (state.isSearchingRecursive || itemParent.toLowerCase() !== curNorm.toLowerCase()) {
            el.ctxMenuOpenLocation.classList.remove('hidden');
          } else {
            el.ctxMenuOpenLocation.classList.add('hidden');
          }
        } else {
          el.ctxMenuOpenLocation.classList.add('hidden');
        }
      } else {
        el.ctxMenuOpenLocation.classList.add('hidden');
      }
    }

    // Position menu within viewport bounds
    const menuWidth = 224;
    const menuHeight = isZip ? 430 : 370;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 8;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 8;
    }

    el.fileContextMenu.style.left = `${Math.max(5, x)}px`;
    el.fileContextMenu.style.top = `${Math.max(5, y)}px`;
    el.fileContextMenu.classList.remove('hidden');
  }

  function closeFileContextMenu() {
    if (el.fileContextMenu) {
      el.fileContextMenu.classList.add('hidden');
    }
    state.contextTargetItem = null;
  }

  // --- Explorer, Properties, Open With, Compress, and Archive Handlers ---
  async function showInSystemExplorer(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    const path = item ? item.path : state.currentDirectory;
    if (!path) return;
    try {
      await invoke('show_in_system_explorer', { path });
    } catch (err) {
      console.warn('Error al mostrar en el explorador:', err);
    }
  }

  async function showItemProperties(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    const path = item ? item.path : state.currentDirectory;
    if (!path) return;
    try {
      await invoke('show_item_properties', { path });
    } catch (err) {
      console.warn('Error al mostrar propiedades:', err);
    }
  }

  let openWithTargetItem = null;

  const APP_SUGGESTIONS = {
    image: [
      { name: 'Fotos (Windows)', cmd: 'ms-photos:' },
      { name: 'Paint', cmd: 'mspaint' },
      { name: 'GIMP', cmd: 'gimp' },
      { name: 'Photoshop', cmd: 'photoshop' },
      { name: 'Navegador Web', cmd: 'msedge' }
    ],
    text: [
      { name: 'Bloc de notas', cmd: 'notepad' },
      { name: 'Visual Studio Code', cmd: 'code' },
      { name: 'VSCodium', cmd: 'codium' },
      { name: 'Sublime Text', cmd: 'subl' },
      { name: 'Notepad++', cmd: 'notepad++' },
      { name: 'Neovim', cmd: 'nvim' }
    ],
    office: [
      { name: 'Microsoft Word', cmd: 'winword' },
      { name: 'Microsoft Excel', cmd: 'excel' },
      { name: 'Microsoft PowerPoint', cmd: 'powerpnt' },
      { name: 'LibreOffice Writer', cmd: 'soffice' },
      { name: 'Acrobat Reader', cmd: 'AcroRd32' }
    ],
    media: [
      { name: 'VLC Media Player', cmd: 'vlc' },
      { name: 'Windows Media Player', cmd: 'wmplayer' },
      { name: 'mpv', cmd: 'mpv' },
      { name: 'Spotify', cmd: 'spotify' }
    ],
    archive: [
      { name: 'Explorador de archivos', cmd: 'explorer' },
      { name: '7-Zip', cmd: '7zFM' },
      { name: 'WinRAR', cmd: 'winrar' }
    ],
    general: [
      { name: 'Bloc de notas', cmd: 'notepad' },
      { name: 'Visual Studio Code', cmd: 'code' },
      { name: 'Explorador de archivos', cmd: 'explorer' }
    ]
  };

  function getSuggestionsForExt(ext, fileType) {
    const e = (ext || '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'dng', 'tiff', 'tif'].includes(e) || fileType === 'image') {
      return APP_SUGGESTIONS.image;
    }
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(e) || fileType === 'video' || fileType === 'audio') {
      return APP_SUGGESTIONS.media;
    }
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'pdf'].includes(e) || fileType === 'office' || fileType === 'pdf') {
      return APP_SUGGESTIONS.office;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'].includes(e) || fileType === 'archive') {
      return APP_SUGGESTIONS.archive;
    }
    if (['txt', 'md', 'rs', 'js', 'ts', 'py', 'json', 'toml', 'yaml', 'yml', 'html', 'css', 'c', 'cpp', 'h', 'sh', 'bat', 'ps1', 'ini', 'log'].includes(e) || fileType === 'text' || fileType === 'code') {
      return APP_SUGGESTIONS.text;
    }
    return APP_SUGGESTIONS.general;
  }

  function openOpenWithModal(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    if (!item) return;
    openWithTargetItem = item;

    if (el.openWithFileName) {
      el.openWithFileName.textContent = `${item.name} (${item.path})`;
    }
    if (el.inputOpenWithApp) {
      el.inputOpenWithApp.value = '';
    }

    if (el.openWithSuggestions) {
      el.openWithSuggestions.innerHTML = '';
      const suggestions = getSuggestionsForExt(item.extension, item.file_type);
      suggestions.forEach(s => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'flex items-center gap-2 p-2 rounded-lg bg-gnome-sidebar hover:bg-gnome-hover border border-gnome-border text-left text-xs transition-colors group';
        btn.innerHTML = `
          <span class="text-sm select-none">⚡</span>
          <div class="min-w-0">
            <span class="font-medium text-gnome-text block truncate group-hover:text-white">${escapeHtml(s.name)}</span>
            <span class="text-[10px] text-gnome-textDim font-mono block truncate">${escapeHtml(s.cmd)}</span>
          </div>
        `;
        btn.onclick = async () => {
          closeOpenWithModal();
          try {
            await invoke('launch_with_app', { path: item.path, appCommand: s.cmd });
          } catch (err) {
            alert('Error al abrir con la aplicación: ' + err);
          }
        };
        el.openWithSuggestions.appendChild(btn);
      });
    }

    if (el.modalOpenWith) {
      el.modalOpenWith.classList.remove('hidden');
      if (el.inputOpenWithApp) el.inputOpenWithApp.focus();
    }
  }

  function closeOpenWithModal() {
    if (el.modalOpenWith) {
      el.modalOpenWith.classList.add('hidden');
    }
    openWithTargetItem = null;
    el.fileList.focus();
  }

  async function launchCustomOpenWith() {
    if (!openWithTargetItem || !el.inputOpenWithApp) return;
    const cmd = el.inputOpenWithApp.value.trim();
    if (!cmd) return;
    const targetPath = openWithTargetItem.path;
    closeOpenWithModal();
    try {
      await invoke('launch_with_app', { path: targetPath, appCommand: cmd });
    } catch (err) {
      alert('Error al abrir con el comando especificado: ' + err);
    }
  }

  async function launchSystemOpenWithDialog() {
    if (!openWithTargetItem) return;
    const targetPath = openWithTargetItem.path;
    closeOpenWithModal();
    try {
      await invoke('open_with_dialog', { path: targetPath });
    } catch (err) {
      console.warn('Error al abrir selector del sistema:', err);
    }
  }

  let compressTargetPaths = [];

  function openCompressModal(specificItem = null) {
    if (specificItem) {
      compressTargetPaths = [specificItem.path];
    } else {
      compressTargetPaths = getSelectedOrFocusedPaths();
    }
    if (compressTargetPaths.length === 0) return;

    const firstPath = compressTargetPaths[0];
    const isWindows = /^[a-zA-Z]:[\\\/]/.test(firstPath) || firstPath.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const norm = isWindows ? firstPath.replace(/\//g, '\\') : firstPath.replace(/\\/g, '/');
    const base = norm.split(sep).pop().replace(/\.[^/.]+$/, '');

    const defaultName = compressTargetPaths.length === 1 ? (base || 'archivo') : 'archivo_comprimido';

    if (el.inputCompressName) {
      el.inputCompressName.value = defaultName;
    }
    if (el.compressItemsCount) {
      el.compressItemsCount.textContent = `Se comprimirá ${compressTargetPaths.length} elemento${compressTargetPaths.length > 1 ? 's' : ''} en el directorio actual.`;
    }

    if (el.modalCompress) {
      el.modalCompress.classList.remove('hidden');
      if (el.inputCompressName) {
        el.inputCompressName.focus();
        el.inputCompressName.select();
      }
    }
  }

  function closeCompressModal() {
    if (el.modalCompress) {
      el.modalCompress.classList.add('hidden');
    }
    compressTargetPaths = [];
    el.fileList.focus();
  }

  async function confirmCompress() {
    if (compressTargetPaths.length === 0 || !el.inputCompressName || !state.currentDirectory) return;
    let name = el.inputCompressName.value.trim();
    if (!name) name = 'archivo_comprimido';
    if (!name.toLowerCase().endsWith('.zip')) {
      name += '.zip';
    }

    const isWindows = /^[a-zA-Z]:[\\\/]/.test(state.currentDirectory) || state.currentDirectory.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const cleanDir = state.currentDirectory.replace(/[\\\/]+$/, '');
    const outZipPath = `${cleanDir}${sep}${name}`;

    const sources = [...compressTargetPaths];
    closeCompressModal();

    try {
      await invoke('compress_to_zip', {
        sourcePaths: sources,
        outputZipPath: outZipPath
      });
      await loadDirectory(state.currentDirectory, false);
      const idx = state.filteredItems.findIndex(i => i.path.toLowerCase() === outZipPath.toLowerCase());
      if (idx >= 0) {
        setSelectionIndex(idx);
      }
    } catch (err) {
      alert('Error al comprimir en zip: ' + err);
    }
  }

  async function extractArchiveHere(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    if (!item || !state.currentDirectory) return;
    try {
      await invoke('extract_zip_archive', {
        zipPath: item.path,
        targetDir: state.currentDirectory
      });
      await loadDirectory(state.currentDirectory, false);
    } catch (err) {
      alert('Error al extraer archivo: ' + err);
    }
  }

  async function extractArchiveToSubfolder(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    if (!item || !state.currentDirectory) return;
    const folderName = (item.name || 'archivo').replace(/\.zip$/i, '');
    const isWindows = /^[a-zA-Z]:[\\\/]/.test(state.currentDirectory) || state.currentDirectory.startsWith('\\\\');
    const sep = isWindows ? '\\' : '/';
    const cleanDir = state.currentDirectory.replace(/[\\\/]+$/, '');
    const targetDir = `${cleanDir}${sep}${folderName}`;

    try {
      await invoke('extract_zip_archive', {
        zipPath: item.path,
        targetDir
      });
      await loadDirectory(state.currentDirectory, false);
    } catch (err) {
      alert('Error al extraer en carpeta: ' + err);
    }
  }

  let currentArchiveEntries = [];
  let currentArchiveItem = null;

  async function openArchiveViewModal(targetItem = null) {
    const item = targetItem || state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
    if (!item) return;
    currentArchiveItem = item;

    if (el.archiveViewFileName) {
      el.archiveViewFileName.textContent = `${item.name} (${item.path})`;
    }
    if (el.inputArchiveFilter) {
      el.inputArchiveFilter.value = '';
    }

    try {
      const entries = await invoke('list_zip_contents', { zipPath: item.path });
      currentArchiveEntries = entries || [];
      renderArchiveEntries();
      if (el.modalArchiveView) {
        el.modalArchiveView.classList.remove('hidden');
        if (el.inputArchiveFilter) el.inputArchiveFilter.focus();
      }
    } catch (err) {
      alert('Error al leer contenido del zip: ' + err);
    }
  }

  function renderArchiveEntries() {
    if (!el.archiveTableBody) return;
    const filter = (el.inputArchiveFilter ? el.inputArchiveFilter.value.trim().toLowerCase() : '');
    const filtered = currentArchiveEntries.filter(e => !filter || (e.path && e.path.toLowerCase().includes(filter)) || (e.name && e.name.toLowerCase().includes(filter)));

    if (el.archiveTotalCount) {
      el.archiveTotalCount.textContent = `${filtered.length} de ${currentArchiveEntries.length} elementos`;
    }

    el.archiveTableBody.innerHTML = '';
    if (filtered.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="3" class="py-6 text-center text-gnome-textDim italic text-xs">No hay elementos que coincidan</td>`;
      el.archiveTableBody.appendChild(tr);
      return;
    }

    filtered.forEach(entry => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gnome-hover/70 transition-colors';
      const icon = entry.is_directory ? '📁' : '📄';
      tr.innerHTML = `
        <td class="py-1.5 px-3 truncate max-w-[340px]" title="${escapeHtml(entry.path)}">
          <span class="mr-1.5 select-none">${icon}</span>
          <span class="text-gnome-text">${escapeHtml(entry.path)}</span>
        </td>
        <td class="py-1.5 px-3 text-right text-gnome-textDim whitespace-nowrap font-mono">
          ${entry.is_directory ? '--' : formatSize(entry.uncompressed_size)}
        </td>
        <td class="py-1.5 px-3 text-right text-gnome-textDim whitespace-nowrap font-mono">
          ${entry.is_directory ? '--' : formatSize(entry.compressed_size)}
        </td>
      `;
      el.archiveTableBody.appendChild(tr);
    });
  }

  function closeArchiveViewModal() {
    if (el.modalArchiveView) {
      el.modalArchiveView.classList.add('hidden');
    }
    currentArchiveEntries = [];
    currentArchiveItem = null;
    el.fileList.focus();
  }

  // Modals & New File / New Folder
  function openNewFileModal() {
    el.inputNewFileName.value = 'nuevo_archivo.md';
    el.chkOpenAfterCreate.checked = true;
    el.modalNewFile.classList.remove('hidden');
    el.inputNewFileName.focus();
    el.inputNewFileName.select();
  }

  function closeNewFileModal() {
    el.modalNewFile.classList.add('hidden');
    el.fileList.focus();
  }

  async function confirmNewFile() {
    const fileName = el.inputNewFileName.value.trim();
    if (!fileName) return;

    try {
      const openAfter = el.chkOpenAfterCreate.checked;
      await invoke('create_new_file', {
        dirPath: state.currentDirectory,
        fileName,
        openAfter
      });
      closeNewFileModal();
      await loadDirectory(state.currentDirectory, false);

      // Select the newly created file
      const idx = state.filteredItems.findIndex(i => i.name.toLowerCase() === fileName.toLowerCase());
      if (idx >= 0) setSelectionIndex(idx);
    } catch (err) {
      alert('Error al crear archivo: ' + err);
    }
  }

  function openNewFolderModal() {
    el.inputNewFolderName.value = 'Nueva Carpeta';
    el.modalNewFolder.classList.remove('hidden');
    el.inputNewFolderName.focus();
    el.inputNewFolderName.select();
  }

  function closeNewFolderModal() {
    el.modalNewFolder.classList.add('hidden');
    el.fileList.focus();
  }

  async function confirmNewFolder() {
    const folderName = el.inputNewFolderName.value.trim();
    if (!folderName) return;

    try {
      await invoke('create_new_directory', {
        dirPath: state.currentDirectory,
        folderName
      });
      closeNewFolderModal();
      await loadDirectory(state.currentDirectory, false);

      // Select newly created folder
      const idx = state.filteredItems.findIndex(i => i.name.toLowerCase() === folderName.toLowerCase());
      if (idx >= 0) setSelectionIndex(idx);
    } catch (err) {
      alert('Error al crear carpeta: ' + err);
    }
  }

  // Network Dialog
  function openNetworkModal() {
    el.inputNetworkPath.value = '\\\\';
    el.modalNetwork.classList.remove('hidden');
    el.inputNetworkPath.focus();
  }

  function closeNetworkModal() {
    el.modalNetwork.classList.add('hidden');
    el.fileList.focus();
  }

  function confirmNetwork() {
    const path = el.inputNetworkPath.value.trim();
    if (path) {
      closeNetworkModal();
      loadDirectory(path);
    }
  }

  // Help & Shortcuts Modal
  function openHelpModal() {
    el.modalHelp.classList.remove('hidden');
  }

  function closeHelpModal() {
    el.modalHelp.classList.add('hidden');
    el.fileList.focus();
  }

  async function openAboutModal() {
    try {
      const info = await invoke('get_app_info');
      if (info) {
        if (el.aboutVersion) el.aboutVersion.textContent = info.version;
        if (el.aboutBuildUnix) el.aboutBuildUnix.textContent = info.build_timestamp;
        if (el.aboutBuildDate) {
          const d = new Date(info.build_timestamp * 1000);
          el.aboutBuildDate.textContent = d.toLocaleString('es-ES', {
            dateStyle: 'medium',
            timeStyle: 'medium'
          });
        }
      }
    } catch (err) {
      console.warn('Could not fetch app info:', err);
    }
    if (el.modalAbout) el.modalAbout.classList.remove('hidden');
  }

  function closeAboutModal() {
    if (el.modalAbout) el.modalAbout.classList.add('hidden');
    el.fileList.focus();
  }

  // Favorites Management
  function loadFavorites() {
    try {
      const saved = localStorage.getItem('tron_favorites');
      if (saved) {
        state.favorites = JSON.parse(saved);
      } else {
        state.favorites = [];
      }
    } catch (e) {
      state.favorites = [];
    }
    renderFavorites();
  }

  function saveFavorites() {
    try {
      localStorage.setItem('tron_favorites', JSON.stringify(state.favorites));
    } catch (e) {
      console.error(e);
    }
  }

  function addCurrentToFavorites() {
    if (!state.currentDirectory) return;
    const path = state.currentDirectory;
    if (state.favorites.some(f => f.path.toLowerCase() === path.toLowerCase())) {
      return;
    }
    const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
    state.favorites.push({ name, path });
    saveFavorites();
    renderFavorites();
  }

  function removeFavorite(path, e) {
    if (e) e.stopPropagation();
    state.favorites = state.favorites.filter(f => f.path.toLowerCase() !== path.toLowerCase());
    saveFavorites();
    renderFavorites();
  }

  function setupSidebarDropTarget(element, targetDirectory) {
    element.classList.add('drop-target');
    element.dataset.targetDir = targetDirectory;
  }

  // --- Renombrar Elementos (Archivos / Carpetas) ---
  let itemToRename = null;

  function openRenameItemModal(item = null) {
    if (!item) {
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        item = state.filteredItems[state.selectedIndex];
      }
    }
    if (!item) return;
    itemToRename = item;
    if (el.inputRenameItemName) {
      el.inputRenameItemName.value = item.name;
    }
    if (el.modalRenameItem) {
      el.modalRenameItem.classList.remove('hidden');
      if (el.inputRenameItemName) {
        el.inputRenameItemName.focus();
        if (!item.is_directory && item.name.includes('.')) {
          const lastDot = item.name.lastIndexOf('.');
          if (lastDot > 0) {
            el.inputRenameItemName.setSelectionRange(0, lastDot);
          } else {
            el.inputRenameItemName.select();
          }
        } else {
          el.inputRenameItemName.select();
        }
      }
    }
  }

  function closeRenameItemModal() {
    if (el.modalRenameItem) {
      el.modalRenameItem.classList.add('hidden');
    }
    itemToRename = null;
    el.fileList.focus();
  }

  async function saveRenamedItem() {
    if (!itemToRename || !el.inputRenameItemName) return;
    const newName = el.inputRenameItemName.value.trim();
    if (!newName) return;
    if (newName === itemToRename.name) {
      closeRenameItemModal();
      return;
    }
    try {
      await invoke('rename_file_or_folder', {
        oldPath: itemToRename.path,
        newName: newName
      });
      closeRenameItemModal();
      await loadDirectory(state.currentDirectory, false);
      const idx = state.filteredItems.findIndex(i => i.name.toLowerCase() === newName.toLowerCase());
      if (idx >= 0) {
        setSelectionIndex(idx);
      }
    } catch (err) {
      alert('Error al renombrar: ' + err);
    }
  }

  let favoriteToRename = null;

  function openRenameFavoriteModal(favorite) {
    favoriteToRename = favorite;
    if (el.inputRenameFavName) {
      el.inputRenameFavName.value = favorite.name;
    }
    if (el.modalRenameFavorite) {
      el.modalRenameFavorite.classList.remove('hidden');
      el.inputRenameFavName.focus();
      el.inputRenameFavName.select();
    }
  }

  function closeRenameFavoriteModal() {
    if (el.modalRenameFavorite) {
      el.modalRenameFavorite.classList.add('hidden');
    }
    favoriteToRename = null;
    el.fileList.focus();
  }

  function saveRenamedFavorite() {
    if (!favoriteToRename || !el.inputRenameFavName) return;
    const newName = el.inputRenameFavName.value.trim();
    if (newName) {
      const idx = state.favorites.findIndex(f => f.path.toLowerCase() === favoriteToRename.path.toLowerCase());
      if (idx >= 0) {
        state.favorites[idx].name = newName;
        saveFavorites();
        renderFavorites();
      }
    }
    closeRenameFavoriteModal();
  }

  function renderFavorites() {
    el.favoriteLinks.innerHTML = '';
    if (state.favorites.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'text-[11px] text-gnome-textDim px-2 py-1 italic';
      emptyMsg.textContent = 'Sin favoritos aún (Ctrl+B)';
      el.favoriteLinks.appendChild(emptyMsg);
      return;
    }

    state.favorites.forEach((f, idx) => {
      const itemRow = document.createElement('div');
      itemRow.className = 'group flex items-center justify-between px-2 py-1 rounded-md hover:bg-gnome-hover text-xs text-gnome-text transition-colors cursor-pointer select-none relative';
      itemRow.title = `${f.name} (${f.path})\nArrastra para reordenar o clic derecho para renombrar`;
      itemRow.draggable = true;
      itemRow.dataset.favIndex = String(idx);

      // Drag and Drop reordering for favorites
      itemRow.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(idx));
        e.dataTransfer.effectAllowed = 'move';
        itemRow.classList.add('opacity-40');
      });

      itemRow.addEventListener('dragend', () => {
        itemRow.classList.remove('opacity-40');
        document.querySelectorAll('#favoriteLinks > div').forEach(d => {
          d.classList.remove('border-t-2', 'border-b-2', 'border-gnome-active');
        });
      });

      itemRow.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = itemRow.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          itemRow.classList.add('border-t-2', 'border-gnome-active');
          itemRow.classList.remove('border-b-2');
        } else {
          itemRow.classList.add('border-b-2', 'border-gnome-active');
          itemRow.classList.remove('border-t-2');
        }
      });

      itemRow.addEventListener('dragleave', () => {
        itemRow.classList.remove('border-t-2', 'border-b-2', 'border-gnome-active');
      });

      itemRow.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        itemRow.classList.remove('border-t-2', 'border-b-2', 'border-gnome-active');
        const fromIdxStr = e.dataTransfer.getData('text/plain');
        if (!fromIdxStr && fromIdxStr !== '0') return;
        const fromIdx = parseInt(fromIdxStr, 10);
        if (isNaN(fromIdx) || fromIdx < 0 || fromIdx >= state.favorites.length) return;

        const rect = itemRow.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        let toIdx = idx;
        if (e.clientY >= midY && fromIdx < idx) {
          toIdx = idx;
        } else if (e.clientY < midY && fromIdx > idx) {
          toIdx = idx;
        }

        if (fromIdx !== toIdx) {
          const [movedItem] = state.favorites.splice(fromIdx, 1);
          state.favorites.splice(toIdx, 0, movedItem);
          saveFavorites();
          renderFavorites();
        }
      });

      const leftPart = document.createElement('div');
      leftPart.className = 'flex items-center gap-2 min-w-0 flex-1 truncate';
      leftPart.innerHTML = `<span class="text-xs opacity-50 cursor-grab" title="Arrastrar para reordenar">⠿</span> <span class="text-sm">⭐</span> <span class="truncate">${escapeHtml(f.name)}</span>`;

      const rightPart = document.createElement('div');
      rightPart.className = 'flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity';

      // Reorder buttons (Move up / Move down)
      if (idx > 0) {
        const btnUp = document.createElement('button');
        btnUp.className = 'text-gnome-textDim hover:text-gnome-text text-[10px] px-1 py-0.5 leading-none';
        btnUp.title = 'Mover arriba';
        btnUp.textContent = '▲';
        btnUp.onclick = (e) => {
          e.stopPropagation();
          const temp = state.favorites[idx];
          state.favorites[idx] = state.favorites[idx - 1];
          state.favorites[idx - 1] = temp;
          saveFavorites();
          renderFavorites();
        };
        rightPart.appendChild(btnUp);
      }

      if (idx < state.favorites.length - 1) {
        const btnDown = document.createElement('button');
        btnDown.className = 'text-gnome-textDim hover:text-gnome-text text-[10px] px-1 py-0.5 leading-none';
        btnDown.title = 'Mover abajo';
        btnDown.textContent = '▼';
        btnDown.onclick = (e) => {
          e.stopPropagation();
          const temp = state.favorites[idx];
          state.favorites[idx] = state.favorites[idx + 1];
          state.favorites[idx + 1] = temp;
          saveFavorites();
          renderFavorites();
        };
        rightPart.appendChild(btnDown);
      }

      const btnEdit = document.createElement('button');
      btnEdit.className = 'text-gnome-textDim hover:text-gnome-active text-xs px-1';
      btnEdit.title = 'Renombrar favorito';
      btnEdit.textContent = '✏️';
      btnEdit.onclick = (e) => {
        e.stopPropagation();
        openRenameFavoriteModal(f);
      };

      const btnRemove = document.createElement('button');
      btnRemove.className = 'text-gnome-textDim hover:text-red-400 text-xs px-1';
      btnRemove.title = 'Quitar de favoritos';
      btnRemove.textContent = '✕';
      btnRemove.onclick = (e) => removeFavorite(f.path, e);

      rightPart.appendChild(btnEdit);
      rightPart.appendChild(btnRemove);

      itemRow.onclick = () => loadDirectory(f.path);
      // Right click context menu to rename
      itemRow.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openRenameFavoriteModal(f);
      });

      itemRow.appendChild(leftPart);
      itemRow.appendChild(rightPart);

      setupSidebarDropTarget(itemRow, f.path);
      el.favoriteLinks.appendChild(itemRow);
    });
  }

  // Sidebar Loading (Drives & Quick Links with real absolute paths)
  async function loadSidebar() {
    // 1. User Places with guaranteed absolute paths from Rust backend
    try {
      const places = await invoke('get_user_places') || [];
      el.quickLinks.innerHTML = '';
      places.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gnome-hover text-xs text-gnome-text text-left transition-colors';
        btn.innerHTML = `<span class="text-sm">${p.icon}</span> <span class="truncate">${escapeHtml(p.name)}</span>`;
        btn.title = p.path;
        btn.onclick = () => loadDirectory(p.path);
        setupSidebarDropTarget(btn, p.path);
        el.quickLinks.appendChild(btn);
      });
    } catch (e) {
      console.warn('Error al obtener lugares de usuario:', e);
    }

    // 2. Drives
    try {
      const drives = await invoke('get_system_drives') || [];
      el.driveLinks.innerHTML = '';
      drives.forEach(d => {
        const btn = document.createElement('button');
        btn.className = 'w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gnome-hover text-xs text-gnome-text text-left transition-colors';
        btn.innerHTML = `<span class="text-sm">💽</span> <span class="truncate">${escapeHtml(d.name)}</span>`;
        btn.onclick = () => loadDirectory(d.path);
        setupSidebarDropTarget(btn, d.path);
        el.driveLinks.appendChild(btn);
      });
    } catch (e) {
      console.warn('Error al obtener unidades:', e);
    }

    // 3. Favorites
    loadFavorites();
  }

  // Setup Menu Dropdowns (Auto-open on hover once active)
  let isAnyMenuOpen = false;

  function setupMenus() {
    const dropdowns = document.querySelectorAll('.menu-dropdown');
    dropdowns.forEach(dd => {
      const btn = dd.querySelector('.menu-btn');
      const content = dd.querySelector('.menu-content');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = !content.classList.contains('hidden');
        closeAllMenus();
        if (!wasOpen) {
          content.classList.remove('hidden');
          isAnyMenuOpen = true;
        }
      });

      btn.addEventListener('mouseenter', () => {
        if (isAnyMenuOpen) {
          closeAllMenus(false); // don't reset isAnyMenuOpen flag
          content.classList.remove('hidden');
          isAnyMenuOpen = true;
        }
      });
    });

    // Close on outside click
    document.addEventListener('click', () => closeAllMenus());
  }

  function closeAllMenus(resetFlag = true) {
    document.querySelectorAll('.menu-content').forEach(c => c.classList.add('hidden'));
    if (resetFlag) isAnyMenuOpen = false;
  }

  // Initialization & Event Listeners
  function init() {
    window.addEventListener('keydown', handleGlobalKeyDown);

    // Navigation bar
    el.btnBack.onclick = goBack;
    el.btnForward.onclick = goForward;
    if (el.btnParentDir) el.btnParentDir.onclick = goUp;
    el.btnRefresh.onclick = () => loadDirectory(state.currentDirectory, false);

    // QuickView
    el.btnQvClose.onclick = closeQuickView;
    el.btnQvDelete.onclick = deleteCurrentItem;
    if (el.btnQvOpenDefault) {
      el.btnQvOpenDefault.onclick = () => {
        if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
          activateItem(state.filteredItems[state.selectedIndex]);
        }
      };
    }
    if (el.btnQvOpenEditor) {
      el.btnQvOpenEditor.onclick = () => {
        if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
          const item = state.filteredItems[state.selectedIndex];
          openInTextEditor(item.path);
        }
      };
    }

    // Action Bar buttons
    if (el.btnActionTerminal) {
      el.btnActionTerminal.onclick = openCurrentTerminal;
    }
    if (el.btnActionEdit) {
      el.btnActionEdit.onclick = () => {
        let targetPath = state.currentDirectory;
        if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
          targetPath = state.filteredItems[state.selectedIndex].path;
        }
        if (targetPath) {
          openInTextEditor(targetPath);
        }
      };
    }
    el.btnActionNewFile.onclick = openNewFileModal;
    el.btnActionNewFolder.onclick = openNewFolderModal;
    el.btnActionCut.onclick = cutSelectedItems;
    el.btnActionCopy.onclick = copySelectedItems;
    el.btnActionPaste.onclick = pasteClipboardItems;
    el.btnActionDelete.onclick = deleteCurrentItem;
    el.btnActionQuickView.onclick = openQuickView;

    // Sidebar buttons
    el.btnAddCurrentFav.onclick = addCurrentToFavorites;
    el.btnConnectNetwork.onclick = openNetworkModal;
    el.btnOpenNetworkDialog.onclick = openNetworkModal;

    // Menus Actions
    setupMenus();
    el.menuNewFile.onclick = () => { closeAllMenus(); openNewFileModal(); };
    el.menuNewFolder.onclick = () => { closeAllMenus(); openNewFolderModal(); };
    if (el.menuRename) el.menuRename.onclick = () => { closeAllMenus(); openRenameItemModal(); };
    el.menuOpenDefault.onclick = () => {
      closeAllMenus();
      if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
        activateItem(state.filteredItems[state.selectedIndex]);
      }
    };
    if (el.menuOpenWith) el.menuOpenWith.onclick = () => { closeAllMenus(); openOpenWithModal(); };
    if (el.menuShowInExplorer) el.menuShowInExplorer.onclick = () => { closeAllMenus(); showInSystemExplorer(); };
    if (el.menuCompress) el.menuCompress.onclick = () => { closeAllMenus(); openCompressModal(); };
    if (el.menuProperties) el.menuProperties.onclick = () => { closeAllMenus(); showItemProperties(); };
    el.menuDelete.onclick = () => { closeAllMenus(); deleteCurrentItem(); };
    el.menuAddFavorite.onclick = () => { closeAllMenus(); addCurrentToFavorites(); };
    el.menuCut.onclick = () => { closeAllMenus(); cutSelectedItems(); };
    el.menuCopy.onclick = () => { closeAllMenus(); copySelectedItems(); };
    el.menuPaste.onclick = () => { closeAllMenus(); pasteClipboardItems(); };
    el.menuSelectAll.onclick = () => {
      closeAllMenus();
      state.selectedItems.clear();
      state.filteredItems.forEach(i => state.selectedItems.add(i.path));
      renderFileList();
      updateStatusBar();
    };
    el.menuQuickView.onclick = () => { closeAllMenus(); openQuickView(); };
    el.menuRefresh.onclick = () => { closeAllMenus(); loadDirectory(state.currentDirectory, false); };
    el.menuShortcuts.onclick = () => { closeAllMenus(); openHelpModal(); };
    el.menuAbout.onclick = () => { closeAllMenus(); openAboutModal(); };

    // Modals events
    el.btnCloseNewFileModal.onclick = closeNewFileModal;
    el.btnCancelNewFile.onclick = closeNewFileModal;
    el.btnConfirmNewFile.onclick = confirmNewFile;
    el.inputNewFileName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirmNewFile();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeNewFileModal();
      }
    });

    // Quick extension buttons in New File modal
    document.querySelectorAll('.ext-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const ext = tag.dataset.ext;
        let current = el.inputNewFileName.value.trim();
        const lastDot = current.lastIndexOf('.');
        if (lastDot > 0) {
          current = current.substring(0, lastDot);
        }
        el.inputNewFileName.value = (current || 'nuevo_archivo') + ext;
        el.inputNewFileName.focus();
      });
    });

    el.btnCloseNewFolderModal.onclick = closeNewFolderModal;
    el.btnCancelNewFolder.onclick = closeNewFolderModal;
    el.btnConfirmNewFolder.onclick = confirmNewFolder;
    el.inputNewFolderName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirmNewFolder();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeNewFolderModal();
      }
    });

    el.btnCloseNetworkModal.onclick = closeNetworkModal;
    el.btnCancelNetwork.onclick = closeNetworkModal;
    el.btnConfirmNetwork.onclick = confirmNetwork;
    el.inputNetworkPath.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        confirmNetwork();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeNetworkModal();
      }
    });

    el.btnCloseHelpModal.onclick = closeHelpModal;
    el.btnConfirmHelp.onclick = closeHelpModal;

    // About modal wiring
    if (el.btnCloseAboutModal) el.btnCloseAboutModal.onclick = closeAboutModal;
    if (el.btnConfirmAbout) el.btnConfirmAbout.onclick = closeAboutModal;
    if (el.linkAboutGithub) {
      el.linkAboutGithub.onclick = (e) => {
        e.preventDefault();
        invoke('open_file_default', { path: 'https://github.com/pedroredond0/tron' }).catch(console.error);
      };
    }

    // Search bar
    el.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (state.searchQuery) {
        el.btnClearSearch.classList.remove('hidden');
      } else {
        el.btnClearSearch.classList.add('hidden');
      }
      triggerSearch();
    });

    el.btnClearSearch.onclick = () => {
      el.searchInput.value = '';
      state.searchQuery = '';
      el.btnClearSearch.classList.add('hidden');
      triggerSearch();
      el.fileList.focus();
    };

    // Close modal on click outside card
    el.quickViewModal.addEventListener('click', (e) => {
      if (e.target === el.quickViewModal) {
        closeQuickView();
      }
    });

    // Close popup dialogs on backdrop click
    [el.modalNewFile, el.modalNewFolder, el.modalNetwork, el.modalHelp, el.modalAppearance, el.modalRenameFavorite, el.modalRenameItem, el.modalConfirmExit, el.modalAbout, el.modalOpenWith, el.modalCompress, el.modalArchiveView].forEach(m => {
      if (m) {
        m.addEventListener('click', (e) => {
          if (e.target === m) m.classList.add('hidden');
        });
      }
    });

    // Open With Modal Wiring
    if (el.btnCloseOpenWithModal) el.btnCloseOpenWithModal.onclick = closeOpenWithModal;
    if (el.btnCancelOpenWith) el.btnCancelOpenWith.onclick = closeOpenWithModal;
    if (el.btnLaunchCustomApp) el.btnLaunchCustomApp.onclick = launchCustomOpenWith;
    if (el.btnOpenWithSystemDialog) el.btnOpenWithSystemDialog.onclick = launchSystemOpenWithDialog;
    if (el.inputOpenWithApp) {
      el.inputOpenWithApp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          launchCustomOpenWith();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeOpenWithModal();
        }
      });
    }

    // Compress Modal Wiring
    if (el.btnCloseCompressModal) el.btnCloseCompressModal.onclick = closeCompressModal;
    if (el.btnCancelCompress) el.btnCancelCompress.onclick = closeCompressModal;
    if (el.btnConfirmCompress) el.btnConfirmCompress.onclick = confirmCompress;
    if (el.inputCompressName) {
      el.inputCompressName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmCompress();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeCompressModal();
        }
      });
    }

    // Archive View Modal Wiring
    if (el.btnCloseArchiveViewModal) el.btnCloseArchiveViewModal.onclick = closeArchiveViewModal;
    if (el.btnArchiveClose) el.btnArchiveClose.onclick = closeArchiveViewModal;
    if (el.inputArchiveFilter) {
      el.inputArchiveFilter.addEventListener('input', renderArchiveEntries);
      el.inputArchiveFilter.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeArchiveViewModal();
        }
      });
    }
    if (el.btnArchiveExtractAll) {
      el.btnArchiveExtractAll.onclick = () => {
        if (currentArchiveItem) {
          const item = currentArchiveItem;
          closeArchiveViewModal();
          extractArchiveHere(item);
        }
      };
    }

    // Rename Item Modal Wiring
    if (el.btnCloseRenameItemModal) el.btnCloseRenameItemModal.onclick = closeRenameItemModal;
    if (el.btnCancelRenameItem) el.btnCancelRenameItem.onclick = closeRenameItemModal;
    if (el.btnConfirmRenameItem) el.btnConfirmRenameItem.onclick = saveRenamedItem;
    if (el.inputRenameItemName) {
      el.inputRenameItemName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          saveRenamedItem();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeRenameItemModal();
        }
      });
    }

    // Rename Favorite Modal Wiring
    if (el.btnCloseRenameFavModal) el.btnCloseRenameFavModal.onclick = closeRenameFavoriteModal;
    if (el.btnCancelRenameFav) el.btnCancelRenameFav.onclick = closeRenameFavoriteModal;
    if (el.btnConfirmRenameFav) el.btnConfirmRenameFav.onclick = saveRenamedFavorite;
    if (el.inputRenameFavName) {
      el.inputRenameFavName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          saveRenamedFavorite();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          closeRenameFavoriteModal();
        }
      });
    }

    // Appearance Modal Wiring
    if (el.btnOpenAppearance) el.btnOpenAppearance.onclick = openAppearanceModal;
    if (el.menuAppearance) el.menuAppearance.onclick = () => { closeAllMenus(); openAppearanceModal(); };
    if (el.btnCloseAppearanceModal) el.btnCloseAppearanceModal.onclick = closeAppearanceModal;
    if (el.btnCancelAppearance) el.btnCancelAppearance.onclick = () => {
      // Revert live preview if canceled
      loadAppearanceSettings();
      closeAppearanceModal();
    };
    if (el.btnConfirmAppearance) el.btnConfirmAppearance.onclick = saveAppearanceSettings;

    // Preferences Tabs Switching
    const prefTabButtons = document.querySelectorAll('.pref-tab-btn');
    const prefTabPanels = {
      tabThemes: document.getElementById('panelThemes'),
      tabTypography: document.getElementById('panelTypography'),
      tabFiles: document.getElementById('panelFiles'),
      tabEditor: document.getElementById('panelEditor'),
      tabTerminal: document.getElementById('panelTerminal')
    };
    prefTabButtons.forEach(btn => {
      btn.onclick = () => {
        prefTabButtons.forEach(b => {
          b.classList.remove('border-gnome-active', 'text-gnome-active');
          b.classList.add('border-transparent', 'text-gnome-textDim');
        });
        btn.classList.remove('border-transparent', 'text-gnome-textDim');
        btn.classList.add('border-gnome-active', 'text-gnome-active');

        const targetId = btn.dataset.tab;
        Object.keys(prefTabPanels).forEach(k => {
          if (prefTabPanels[k]) {
            if (k === targetId) prefTabPanels[k].classList.remove('hidden');
            else prefTabPanels[k].classList.add('hidden');
          }
        });
      };
    });

    if (el.rangeUiScale) {
      el.rangeUiScale.addEventListener('input', (e) => {
        const val = e.target.value;
        updateUiScaleLabel(val);
        // Live preview scale in real time while dragging slider
        document.documentElement.style.setProperty('--app-ui-scale', `${val}px`);
        document.documentElement.style.setProperty('--app-ui-scale-num', val);
      });
    }

    if (el.selectTextEditor) {
      el.selectTextEditor.addEventListener('change', (e) => {
        if (el.customEditorContainer) {
          if (e.target.value === 'custom') {
            el.customEditorContainer.classList.remove('hidden');
          } else {
            el.customEditorContainer.classList.add('hidden');
          }
        }
      });
    }

    if (el.selectTerminalApp) {
      el.selectTerminalApp.addEventListener('change', (e) => {
        if (el.customTerminalContainer) {
          if (e.target.value === 'custom') {
            el.customTerminalContainer.classList.remove('hidden');
          } else {
            el.customTerminalContainer.classList.add('hidden');
          }
        }
      });
    }

    if (el.chkMonochromeIcons) {
      el.chkMonochromeIcons.addEventListener('change', (e) => {
        if (e.target.checked) {
          document.documentElement.setAttribute('data-monochrome-icons', 'true');
        } else {
          document.documentElement.removeAttribute('data-monochrome-icons');
        }
      });
    }

    // Sort Column Headers Wiring
    if (el.sortHeaderName) el.sortHeaderName.onclick = () => setSort('name');
    if (el.sortHeaderType) el.sortHeaderType.onclick = () => setSort('type');
    if (el.sortHeaderSize) el.sortHeaderSize.onclick = () => setSort('size');
    if (el.sortHeaderDate) el.sortHeaderDate.onclick = () => setSort('date');

    // File Context Menu Wiring
    if (el.ctxMenuOpen) {
      el.ctxMenuOpen.onclick = () => {
        closeFileContextMenu();
        if (state.contextTargetItem) {
          activateItem(state.contextTargetItem);
        } else if (state.selectedIndex >= 0 && state.selectedIndex < state.filteredItems.length) {
          activateItem(state.filteredItems[state.selectedIndex]);
        }
      };
    }
    if (el.ctxMenuOpenWith) {
      el.ctxMenuOpenWith.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        openOpenWithModal(item);
      };
    }
    if (el.ctxMenuQuickView) {
      el.ctxMenuQuickView.onclick = () => {
        closeFileContextMenu();
        openQuickView();
      };
    }
    if (el.ctxMenuOpenEditor) {
      el.ctxMenuOpenEditor.onclick = () => {
        closeFileContextMenu();
        const item = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
        if (item) {
          openInTextEditor(item.path);
        }
      };
    }
    if (el.ctxMenuShowInExplorer) {
      el.ctxMenuShowInExplorer.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        showInSystemExplorer(item);
      };
    }
    if (el.ctxMenuExtractHere) {
      el.ctxMenuExtractHere.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        extractArchiveHere(item);
      };
    }
    if (el.ctxMenuExtractToFolder) {
      el.ctxMenuExtractToFolder.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        extractArchiveToSubfolder(item);
      };
    }
    if (el.ctxMenuArchiveViewContent) {
      el.ctxMenuArchiveViewContent.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        openArchiveViewModal(item);
      };
    }
    if (el.ctxMenuCompress) {
      el.ctxMenuCompress.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        openCompressModal(item);
      };
    }
    if (el.ctxMenuRename) {
      el.ctxMenuRename.onclick = () => {
        const item = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
        closeFileContextMenu();
        if (item) {
          openRenameItemModal(item);
        }
      };
    }
    if (el.ctxMenuCut) {
      el.ctxMenuCut.onclick = () => {
        closeFileContextMenu();
        cutSelectedItems();
      };
    }
    if (el.ctxMenuCopy) {
      el.ctxMenuCopy.onclick = () => {
        closeFileContextMenu();
        copySelectedItems();
      };
    }
    if (el.ctxMenuDuplicate) {
      el.ctxMenuDuplicate.onclick = () => {
        const target = state.contextTargetItem;
        closeFileContextMenu();
        duplicateSelectedItem(target);
      };
    }
    if (el.ctxMenuAddFavorite) {
      el.ctxMenuAddFavorite.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        if (item && item.is_directory) {
          if (!state.favorites.some(f => f.path.toLowerCase() === item.path.toLowerCase())) {
            state.favorites.push({ name: item.name, path: item.path });
            saveFavorites();
            renderFavorites();
          }
        } else {
          addCurrentToFavorites();
        }
      };
    }
    if (el.ctxMenuDelete) {
      el.ctxMenuDelete.onclick = () => {
        closeFileContextMenu();
        deleteCurrentItem();
      };
    }
    if (el.ctxMenuProperties) {
      el.ctxMenuProperties.onclick = () => {
        const item = state.contextTargetItem;
        closeFileContextMenu();
        showItemProperties(item);
      };
    }

    // Recursive Search Checkbox (Enabled by default)
    if (el.chkRecursiveSearch) {
      const savedRec = localStorage.getItem('tron_recursive_search');
      el.chkRecursiveSearch.checked = savedRec !== 'false';
      el.chkRecursiveSearch.addEventListener('change', () => {
        localStorage.setItem('tron_recursive_search', el.chkRecursiveSearch.checked ? 'true' : 'false');
        if (state.searchQuery) {
          triggerSearch();
        }
      });
    }

    // Transfer Progress Bar & Details Card Wiring
    if (el.pasteProgressContainer) {
      el.pasteProgressContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.pasteDetailsCard) {
          el.pasteDetailsCard.classList.toggle('hidden');
        }
      });
    }
    if (el.btnClosePasteDetails) {
      el.btnClosePasteDetails.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.pasteDetailsCard) {
          el.pasteDetailsCard.classList.add('hidden');
        }
      });
    }
    // Close context menu on outside click or scroll
    document.addEventListener('click', (e) => {
      closeFileContextMenu();
      if (el.pasteDetailsCard && !el.pasteDetailsCard.contains(e.target) && !el.pasteProgressContainer.contains(e.target)) {
        el.pasteDetailsCard.classList.add('hidden');
      }
    });
    document.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.file-row')) {
        closeFileContextMenu();
      }
    });
    if (el.fileList) {
      el.fileList.addEventListener('scroll', () => closeFileContextMenu());
    }

    // Directory Size Calculation
    if (el.btnActionCalcDirSizes) el.btnActionCalcDirSizes.onclick = calculateAllDirSizes;
    if (el.menuCalcDirSizes) el.menuCalcDirSizes.onclick = () => { closeAllMenus(); calculateAllDirSizes(); };

    // Recursive Search Checkbox
    if (el.chkRecursiveSearch) {
      el.chkRecursiveSearch.addEventListener('change', () => {
        if (state.searchQuery) {
          triggerSearch();
        }
      });
    }

    // Background Transfers Event Listeners (Tauri IPC)
    listen('transfer-progress', (event) => {
      handleTransferProgress(event.payload);
    }).catch(err => console.warn('Error listening transfer-progress:', err));

    listen('transfer-finished', (event) => {
      handleTransferFinished(event.payload);
    }).catch(err => console.warn('Error listening transfer-finished:', err));

    // Native OS file drop (Dragging files from Windows Explorer into the app)
    const handleNativeDrop = (event) => {
      const paths = event.payload?.paths || event.payload; // format varies between Tauri versions
      if (Array.isArray(paths) && paths.length > 0 && state.currentDirectory) {
        // Find if we hovered over a specific directory row based on mouse coordinates?
        // It's safer to just drop them into the current active directory.
        startTransferOperation('copy', paths, state.currentDirectory);
      }
    };
    listen('tauri://drag-drop', handleNativeDrop).catch(() => {});
    listen('tauri://file-drop', handleNativeDrop).catch(() => {});

    // Warn if closing window while transfers are still active
    window.addEventListener('beforeunload', (e) => {
      const activeTransfers = Array.from(state.activeTransfers.values()).filter(t => !t.isDone);
      if (activeTransfers.length > 0) {
        e.preventDefault();
        e.returnValue = 'Hay transferencias de archivos en segundo plano. ¿Seguro que deseas salir?';
        return e.returnValue;
      }
    });

    if (document.getElementById('menuForceQuit')) {
      document.getElementById('menuForceQuit').onclick = () => {
        closeAllMenus();
        invoke('force_exit_app').catch(() => window.close());
      };
    }

    if (el.btnCloseExitModal) el.btnCloseExitModal.onclick = closeConfirmExitModal;
    if (el.btnCancelExit) el.btnCancelExit.onclick = closeConfirmExitModal;
    if (el.btnForceExit) {
      el.btnForceExit.onclick = async () => {
        closeConfirmExitModal();
        invoke('force_exit_app').catch(() => window.close());
      };
    }

    // Hidden files toggle wiring
    if (el.chkShowHidden) {
      el.chkShowHidden.checked = state.showHiddenFiles;
      el.chkShowHidden.addEventListener('change', (e) => {
        setShowHiddenFiles(e.target.checked);
      });
    }

    if (el.menuToggleHidden) {
      el.menuToggleHidden.onclick = () => {
        closeAllMenus();
        toggleShowHiddenFiles();
      };
    }

    // Global dragover & drop prevention to ensure WebView2 allows dropping inside directory rows
    // This prevents the cursor from getting stuck on 'prohibited' when dragging between valid rows
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
    });

    setupSherlockEvents();
    loadAppearanceSettings();
    loadSidebar();
    loadDirectory(null);
  }

  function setShowHiddenFiles(show) {
    state.showHiddenFiles = show;
    localStorage.setItem('tron_show_hidden', show ? 'true' : 'false');
    if (el.chkShowHidden) el.chkShowHidden.checked = show;
    applyFilter();
    renderFileList();
    updateStatusBar();
  }

  function toggleShowHiddenFiles() {
    setShowHiddenFiles(!state.showHiddenFiles);
  }

  function openConfirmExitModal() {
    if (el.modalConfirmExit) {
      el.modalConfirmExit.classList.remove('hidden');
    }
  }

  function closeConfirmExitModal() {
    if (el.modalConfirmExit) {
      el.modalConfirmExit.classList.add('hidden');
    }
  }

  // --- Appearance & Preferences Settings ---
  function openAppearanceModal() {
    const theme = localStorage.getItem('tron_theme') || 'adwaita';
    const density = localStorage.getItem('tron_density') || 'normal';
    const fontSize = localStorage.getItem('tron_fontsize') || 'text-sm';
    const normalWeight = localStorage.getItem('tron_normal_weight') === 'true';
    const uiScale = localStorage.getItem('tron_ui_scale') || '14';
    const customExts = localStorage.getItem('tron_custom_text_exts') || 'sql, str, log, conf, env, bak';
    const textEditor = localStorage.getItem('tron_text_editor') || 'notepad';
    const customEditor = localStorage.getItem('tron_text_editor_custom') || '';
    const terminalApp = localStorage.getItem('tron_terminal_app') || 'default';
    const customTerminal = localStorage.getItem('tron_terminal_custom') || '';
    const monochromeIcons = localStorage.getItem('tron_monochrome_icons') === 'true';
    const recursiveSearch = localStorage.getItem('tron_recursive_search') !== 'false';

    if (el.selectTheme) el.selectTheme.value = theme;
    if (el.chkMonochromeIcons) el.chkMonochromeIcons.checked = monochromeIcons;
    if (el.chkPrefShowHidden) el.chkPrefShowHidden.checked = state.showHiddenFiles;
    if (el.chkPrefRecursiveSearch) el.chkPrefRecursiveSearch.checked = recursiveSearch;

    if (el.selectTextEditor) {
      el.selectTextEditor.value = textEditor;
      if (el.customEditorContainer) {
        if (textEditor === 'custom') el.customEditorContainer.classList.remove('hidden');
        else el.customEditorContainer.classList.add('hidden');
      }
    }
    if (el.inputCustomEditor) el.inputCustomEditor.value = customEditor;

    if (el.selectTerminalApp) {
      el.selectTerminalApp.value = terminalApp;
      if (el.customTerminalContainer) {
        if (terminalApp === 'custom') el.customTerminalContainer.classList.remove('hidden');
        else el.customTerminalContainer.classList.add('hidden');
      }
    }
    if (el.inputCustomTerminal) el.inputCustomTerminal.value = customTerminal;

    if (el.selectFontSize) el.selectFontSize.value = fontSize;
    if (el.chkNormalFontWeight) el.chkNormalFontWeight.checked = normalWeight;
    if (el.inputCustomTextExts) el.inputCustomTextExts.value = customExts;
    if (el.rangeUiScale) {
      el.rangeUiScale.value = uiScale;
      updateUiScaleLabel(uiScale);
    }

    const densityRadios = document.querySelectorAll('input[name="density"]');
    densityRadios.forEach(r => {
      r.checked = (r.value === density);
    });

    el.modalAppearance.classList.remove('hidden');
  }

  function updateUiScaleLabel(val) {
    if (!el.lblUiScaleValue) return;
    const names = {
      '12': '12px (Compacto)',
      '14': '14px (Normal)',
      '16': '16px (Grande)',
      '18': '18px (Muy Grande)',
      '20': '20px (Enorme)'
    };
    el.lblUiScaleValue.textContent = names[val] || `${val}px`;
  }

  function closeAppearanceModal() {
    if (el.modalAppearance) el.modalAppearance.classList.add('hidden');
    el.fileList.focus();
  }

  function saveAppearanceSettings() {
    const theme = el.selectTheme ? el.selectTheme.value : 'adwaita';
    const fontSize = el.selectFontSize ? el.selectFontSize.value : 'text-sm';
    const normalWeight = el.chkNormalFontWeight ? el.chkNormalFontWeight.checked : false;
    const uiScale = el.rangeUiScale ? el.rangeUiScale.value : '14';
    const customExts = el.inputCustomTextExts ? el.inputCustomTextExts.value.trim() : 'sql, str, log, conf, env, bak';
    const textEditor = el.selectTextEditor ? el.selectTextEditor.value : 'notepad';
    const customEditor = el.inputCustomEditor ? el.inputCustomEditor.value.trim() : '';
    const terminalApp = el.selectTerminalApp ? el.selectTerminalApp.value : 'default';
    const customTerminal = el.inputCustomTerminal ? el.inputCustomTerminal.value.trim() : '';
    const monochromeIcons = el.chkMonochromeIcons ? el.chkMonochromeIcons.checked : false;
    const showHidden = el.chkPrefShowHidden ? el.chkPrefShowHidden.checked : state.showHiddenFiles;
    const recursiveSearch = el.chkPrefRecursiveSearch ? el.chkPrefRecursiveSearch.checked : true;

    let density = 'normal';
    const selectedDensity = document.querySelector('input[name="density"]:checked');
    if (selectedDensity) density = selectedDensity.value;

    localStorage.setItem('tron_theme', theme);
    localStorage.setItem('tron_density', density);
    localStorage.setItem('tron_fontsize', fontSize);
    localStorage.setItem('tron_normal_weight', normalWeight ? 'true' : 'false');
    localStorage.setItem('tron_ui_scale', uiScale);
    localStorage.setItem('tron_custom_text_exts', customExts);
    localStorage.setItem('tron_text_editor', textEditor);
    localStorage.setItem('tron_text_editor_custom', customEditor);
    localStorage.setItem('tron_terminal_app', terminalApp);
    localStorage.setItem('tron_terminal_custom', customTerminal);
    localStorage.setItem('tron_monochrome_icons', monochromeIcons ? 'true' : 'false');
    localStorage.setItem('tron_show_hidden', showHidden ? 'true' : 'false');
    localStorage.setItem('tron_recursive_search', recursiveSearch ? 'true' : 'false');

    state.textEditor = textEditor;
    state.textEditorCustomPath = customEditor;
    state.terminalApp = terminalApp;
    state.terminalCustomPath = customTerminal;
    state.monochromeIcons = monochromeIcons;
    state.showHiddenFiles = showHidden;
    if (el.chkShowHidden) el.chkShowHidden.checked = showHidden;
    if (el.chkRecursiveSearch) el.chkRecursiveSearch.checked = recursiveSearch;

    state.customTextExts = customExts
      .split(',')
      .map(s => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);

    applyAppearanceSettings(theme, density, fontSize, normalWeight, uiScale, monochromeIcons);
    closeAppearanceModal();
    applyFilter();
    renderFileList();
  }

  function loadAppearanceSettings() {
    const theme = localStorage.getItem('tron_theme') || 'adwaita';
    const density = localStorage.getItem('tron_density') || 'normal';
    const fontSize = localStorage.getItem('tron_fontsize') || 'text-sm';
    const normalWeight = localStorage.getItem('tron_normal_weight') === 'true';
    const uiScale = localStorage.getItem('tron_ui_scale') || '14';
    const customExts = localStorage.getItem('tron_custom_text_exts') || 'sql, str, log, conf, env, bak';
    const monochromeIcons = localStorage.getItem('tron_monochrome_icons') === 'true';
    const savedRec = localStorage.getItem('tron_recursive_search');
    if (el.chkRecursiveSearch) {
      el.chkRecursiveSearch.checked = savedRec !== 'false';
    }

    state.terminalApp = localStorage.getItem('tron_terminal_app') || 'default';
    state.terminalCustomPath = localStorage.getItem('tron_terminal_custom') || '';
    state.monochromeIcons = monochromeIcons;
    state.customTextExts = customExts
      .split(',')
      .map(s => s.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);

    applyAppearanceSettings(theme, density, fontSize, normalWeight, uiScale, monochromeIcons);
  }

  function applyAppearanceSettings(theme, density, fontSize, normalWeight, uiScale = '14', monochromeIcons = false) {
    document.body.setAttribute('data-theme', theme);
    state.normalFontWeight = normalWeight;

    if (monochromeIcons) {
      document.documentElement.setAttribute('data-monochrome-icons', 'true');
    } else {
      document.documentElement.removeAttribute('data-monochrome-icons');
    }

    // Apply UI scale CSS variables globally
    const scalePx = `${uiScale}px`;
    document.documentElement.style.setProperty('--app-ui-scale', scalePx);
    document.documentElement.style.setProperty('--app-ui-scale-num', uiScale);

    // Apply row padding based on density
    let rowPadding = '6px';
    if (density === 'compact') rowPadding = '2px';
    if (density === 'spacious') rowPadding = '12px';
    document.documentElement.style.setProperty('--app-row-padding', rowPadding);

    // Apply font size class to appBody and fileList
    const body = document.getElementById('appBody');
    if (body) {
      body.classList.remove('text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl');
      body.classList.add(fontSize);
    }

    renderFileList();
  }

  // --- Directory Size Calculation ---
  async function calculateAllDirSizes() {
    const dirItems = state.filteredItems.filter(i => i.is_directory);
    if (dirItems.length === 0) return;

    if (el.btnActionCalcDirSizes) {
      el.btnActionCalcDirSizes.classList.add('animate-pulse', 'text-gnome-active');
    }

    for (const d of dirItems) {
      try {
        const res = await invoke('get_directory_size', { path: d.path });
        if (res) {
          state.dirSizes.set(d.path, res);
          // Dynamically update the row in DOM without full reload
          const row = el.fileList.querySelector(`[data-path="${CSS.escape(d.path)}"]`);
          if (row) {
            const colSize = row.children[1];
            if (colSize) {
              colSize.textContent = formatSize(res.total_size);
              colSize.title = `${res.file_count} archivos, ${res.dir_count} subcarpetas`;
            }
          }
        }
      } catch (err) {
        console.warn('Error calculando tamaño:', d.path, err);
      }
    }

    if (el.btnActionCalcDirSizes) {
      el.btnActionCalcDirSizes.classList.remove('animate-pulse', 'text-gnome-active');
    }
  }

  // --- Search Handling (Local vs Recursive) ---
  async function triggerSearch() {
    const q = state.searchQuery.toLowerCase().trim();
    const isRecursive = el.chkRecursiveSearch && el.chkRecursiveSearch.checked;

    if (!q) {
      state.isSearchingRecursive = false;
      state.searchItems = null;
      applyFilter();
      state.selectedIndex = state.filteredItems.length > 0 ? 0 : -1;
      state.selectionAnchor = state.selectedIndex;
      state.selectedItems.clear();
      if (state.selectedIndex >= 0) {
        state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
      }
      renderFileList();
      updateStatusBar();
      return;
    }

    if (!isRecursive) {
      state.isSearchingRecursive = false;
      state.searchItems = null;
      applyFilter();
      state.selectedIndex = state.filteredItems.length > 0 ? 0 : -1;
      state.selectionAnchor = state.selectedIndex;
      state.selectedItems.clear();
      if (state.selectedIndex >= 0) {
        state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
      }
      renderFileList();
      updateStatusBar();
      return;
    }

    // Recursive search via Rust backend
    try {
      state.isSearchingRecursive = true;
      el.statusSelection.textContent = 'Buscando recursivamente...';
      const results = await invoke('search_directory_recursive', {
        basePath: state.currentDirectory,
        query: q,
        maxResults: 200
      });
      state.searchItems = results || [];
      state.filteredItems = sortItems([...state.searchItems]);
      state.selectedIndex = state.filteredItems.length > 0 ? 0 : -1;
      state.selectionAnchor = state.selectedIndex;
      state.selectedItems.clear();
      if (state.selectedIndex >= 0) {
        state.selectedItems.add(state.filteredItems[state.selectedIndex].path);
      }
      renderFileList();
      updateStatusBar();
    } catch (err) {
      console.error('Error en búsqueda recursiva:', err);
      state.isSearchingRecursive = false;
      state.searchItems = null;
      applyFilter();
      renderFileList();
      updateStatusBar();
    }
  }

  // --- Sherlock Advanced Search Controller ---
  function openSherlockModal() {
    if (!el.modalSherlock) return;
    if (el.sherlockCurrentPath) {
      el.sherlockCurrentPath.textContent = state.currentDirectory || '--';
      el.sherlockCurrentPath.title = state.currentDirectory || '';
    }
    el.modalSherlock.classList.remove('hidden');
    if (el.inputSherlockQuery) {
      el.inputSherlockQuery.focus();
      el.inputSherlockQuery.select();
    }
  }

  function closeSherlockModal() {
    if (!el.modalSherlock) return;
    el.modalSherlock.classList.add('hidden');
    el.fileList.focus();
  }

  function resetSherlockFilters() {
    if (el.inputSherlockQuery) el.inputSherlockQuery.value = '';
    if (el.selectSherlockSizeMode) el.selectSherlockSizeMode.value = 'all';
    if (el.sliderSherlockSize) el.sliderSherlockSize.value = 50;
    if (el.inputSherlockSizeNum) el.inputSherlockSizeNum.value = 50;
    if (el.selectSherlockSizeUnit) el.selectSherlockSizeUnit.value = 'MB';
    if (el.sherlockSizeControls) {
      el.sherlockSizeControls.classList.add('opacity-50', 'pointer-events-none');
    }
    if (el.inputSherlockDateStart) el.inputSherlockDateStart.value = '';
    if (el.inputSherlockDateEnd) el.inputSherlockDateEnd.value = '';
    if (el.chkSherlockRoot) el.chkSherlockRoot.checked = false;
  }

  function formatSherlockDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function handleDateInputClick(input) {
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch (_) {}
    }
  }

  async function runSherlock(config) {
    const isRoot = !!config.search_root;
    const filter = {
      base_path: state.currentDirectory,
      search_root: isRoot,
      preset: config.preset || null,
      query: config.query || null,
      size_mode: config.size_mode || null,
      size_bytes: config.size_bytes || null,
      min_date: config.min_date || null,
      max_date: config.max_date || null,
      max_results: config.max_results || 300
    };

    if (el.txtExecuteSherlock) el.txtExecuteSherlock.textContent = 'Buscando...';
    if (el.btnExecuteSherlock) el.btnExecuteSherlock.disabled = true;

    el.fileList.innerHTML = `
      <div class="p-12 text-center text-xs text-gnome-textDim flex flex-col items-center gap-3">
        <span class="text-3xl animate-bounce">🔍</span>
        <span class="font-medium text-gnome-text">Buscando con Sherlock...</span>
        <span class="text-[11px] text-gnome-textDim">Explorando ${isRoot ? 'raíz del sistema' : 'directorio actual'}</span>
      </div>
    `;

    try {
      const res = await invoke('sherlock_search', { filter });
      if (!res) throw new Error('Respuesta no válida del servidor');

      // Cache directory sizes if returned (e.g. for largest_dirs preset)
      if (res.dir_sizes && Array.isArray(res.dir_sizes)) {
        res.dir_sizes.forEach(ds => {
          state.dirSizes.set(ds.path, ds);
        });
      }

      state.isSearchingRecursive = true;
      state.sherlockResults = res.items || [];
      state.filteredItems = sortItems([...state.sherlockResults]);
      state.activeSherlockFilter = { ...config, filter };

      // Update banner UI
      if (el.sherlockBanner) {
        el.sherlockBanner.classList.remove('hidden');
        if (el.sherlockBannerTitle) el.sherlockBannerTitle.textContent = config.title || 'Filtro personalizado';
        if (el.sherlockBannerScope) {
          el.sherlockBannerScope.textContent = `En: ${isRoot ? 'Raíz del sistema' : state.currentDirectory}`;
        }
        if (el.sherlockBannerCount) {
          el.sherlockBannerCount.textContent = `${state.filteredItems.length} resultado${state.filteredItems.length === 1 ? '' : 's'}`;
        }
      }

      if (state.filteredItems.length > 0) {
        setSelectionIndex(0);
      } else {
        state.selectedIndex = -1;
        state.selectedItems.clear();
        renderFileList();
        updateStatusBar();
      }

      closeSherlockModal();
    } catch (err) {
      console.error('Error en búsqueda Sherlock:', err);
      alert('Error en búsqueda Sherlock: ' + err);
      state.isSearchingRecursive = false;
      applyFilter();
      renderFileList();
      updateStatusBar();
    } finally {
      if (el.txtExecuteSherlock) el.txtExecuteSherlock.textContent = 'Buscar con Sherlock';
      if (el.btnExecuteSherlock) el.btnExecuteSherlock.disabled = false;
    }
  }

  function executeSherlockFromInputs() {
    const q = el.inputSherlockQuery ? el.inputSherlockQuery.value.trim() : '';
    const sizeMode = el.selectSherlockSizeMode ? el.selectSherlockSizeMode.value : 'all';
    let sizeBytes = null;

    if (sizeMode !== 'all') {
      const rawNum = parseFloat(el.inputSherlockSizeNum?.value || '0');
      const unit = el.selectSherlockSizeUnit?.value || 'MB';
      let multiplier = 1024 * 1024;
      if (unit === 'KB') multiplier = 1024;
      if (unit === 'GB') multiplier = 1024 * 1024 * 1024;
      sizeBytes = Math.round(rawNum * multiplier);
    }

    let minDate = null;
    let maxDate = null;
    if (el.inputSherlockDateStart && el.inputSherlockDateStart.value) {
      const d = new Date(el.inputSherlockDateStart.value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        minDate = Math.floor(d.getTime() / 1000);
      }
    }
    if (el.inputSherlockDateEnd && el.inputSherlockDateEnd.value) {
      const d = new Date(el.inputSherlockDateEnd.value + 'T23:59:59');
      if (!isNaN(d.getTime())) {
        maxDate = Math.floor(d.getTime() / 1000);
      }
    }

    const isRoot = el.chkSherlockRoot ? el.chkSherlockRoot.checked : false;

    let titleParts = [];
    if (q) titleParts.push(`"${q}"`);
    if (sizeMode === 'gt') titleParts.push(`> ${el.inputSherlockSizeNum.value} ${el.selectSherlockSizeUnit.value}`);
    if (sizeMode === 'lt') titleParts.push(`< ${el.inputSherlockSizeNum.value} ${el.selectSherlockSizeUnit.value}`);
    if (el.inputSherlockDateStart?.value || el.inputSherlockDateEnd?.value) {
      titleParts.push(`Fechas: ${el.inputSherlockDateStart?.value || '...'} a ${el.inputSherlockDateEnd?.value || '...'}`);
    }

    const title = titleParts.length > 0 ? `Filtro: ${titleParts.join(', ')}` : 'Búsqueda personalizada';

    runSherlock({
      search_root: isRoot,
      query: q,
      size_mode: sizeMode,
      size_bytes: sizeBytes,
      min_date: minDate,
      max_date: maxDate,
      title
    });
  }

  function setupSherlockEvents() {
    // Open / Close / Reset
    if (el.btnActionSherlock) el.btnActionSherlock.onclick = openSherlockModal;
    if (el.btnCloseSherlockModal) el.btnCloseSherlockModal.onclick = closeSherlockModal;
    if (el.btnCancelSherlock) el.btnCancelSherlock.onclick = closeSherlockModal;
    if (el.btnResetSherlockFilters) el.btnResetSherlockFilters.onclick = resetSherlockFilters;
    if (el.modalSherlock) {
      el.modalSherlock.addEventListener('click', (e) => {
        if (e.target === el.modalSherlock) closeSherlockModal();
      });
    }

    // Banner wiring
    if (el.btnSherlockBannerEdit) el.btnSherlockBannerEdit.onclick = openSherlockModal;
    if (el.btnSherlockBannerClose) {
      el.btnSherlockBannerClose.onclick = () => {
        if (el.sherlockBanner) el.sherlockBanner.classList.add('hidden');
        state.activeSherlockFilter = null;
        state.sherlockResults = null;
        loadDirectory(state.currentDirectory, false);
      };
    }

    // Presets
    if (el.btnPreset24h) {
      el.btnPreset24h.onclick = () => {
        const isRoot = el.chkSherlockRoot ? el.chkSherlockRoot.checked : false;
        runSherlock({
          preset: 'last_24h',
          search_root: isRoot,
          title: 'Preset: Últimas 24 horas'
        });
      };
    }

    if (el.btnPresetLargeFiles) {
      el.btnPresetLargeFiles.onclick = () => {
        const isRoot = el.chkSherlockRoot ? el.chkSherlockRoot.checked : false;
        runSherlock({
          preset: 'largest_files',
          search_root: isRoot,
          title: 'Preset: 25 Archivos Grandes'
        });
      };
    }

    if (el.btnPresetLargeDirs) {
      el.btnPresetLargeDirs.onclick = () => {
        const isRoot = el.chkSherlockRoot ? el.chkSherlockRoot.checked : false;
        runSherlock({
          preset: 'largest_dirs',
          search_root: isRoot,
          title: 'Preset: 25 Directorios Grandes'
        });
      };
    }

    // Size filter controls
    if (el.selectSherlockSizeMode) {
      el.selectSherlockSizeMode.addEventListener('change', () => {
        const isAll = el.selectSherlockSizeMode.value === 'all';
        if (el.sherlockSizeControls) {
          if (isAll) {
            el.sherlockSizeControls.classList.add('opacity-50', 'pointer-events-none');
          } else {
            el.sherlockSizeControls.classList.remove('opacity-50', 'pointer-events-none');
          }
        }
      });
    }

    if (el.sliderSherlockSize && el.inputSherlockSizeNum) {
      el.sliderSherlockSize.addEventListener('input', () => {
        el.inputSherlockSizeNum.value = el.sliderSherlockSize.value;
      });
      el.inputSherlockSizeNum.addEventListener('input', () => {
        const val = Number(el.inputSherlockSizeNum.value) || 0;
        el.sliderSherlockSize.value = Math.min(Number(el.sliderSherlockSize.max), Math.max(Number(el.sliderSherlockSize.min), val));
      });
    }

    // Date inputs: Calendar on click
    if (el.inputSherlockDateStart) {
      el.inputSherlockDateStart.addEventListener('click', () => handleDateInputClick(el.inputSherlockDateStart));
    }
    if (el.inputSherlockDateEnd) {
      el.inputSherlockDateEnd.addEventListener('click', () => handleDateInputClick(el.inputSherlockDateEnd));
    }

    // Quick date helpers
    if (el.btnDateQuickWeek) {
      el.btnDateQuickWeek.onclick = () => {
        const today = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 7);
        if (el.inputSherlockDateStart) el.inputSherlockDateStart.value = formatSherlockDate(weekAgo);
        if (el.inputSherlockDateEnd) el.inputSherlockDateEnd.value = formatSherlockDate(today);
      };
    }

    if (el.btnDateQuickMonth) {
      el.btnDateQuickMonth.onclick = () => {
        const today = new Date();
        const monthAgo = new Date();
        monthAgo.setDate(today.getDate() - 30);
        if (el.inputSherlockDateStart) el.inputSherlockDateStart.value = formatSherlockDate(monthAgo);
        if (el.inputSherlockDateEnd) el.inputSherlockDateEnd.value = formatSherlockDate(today);
      };
    }

    if (el.btnDateClear) {
      el.btnDateClear.onclick = () => {
        if (el.inputSherlockDateStart) el.inputSherlockDateStart.value = '';
        if (el.inputSherlockDateEnd) el.inputSherlockDateEnd.value = '';
      };
    }

    // Execute button
    if (el.btnExecuteSherlock) {
      el.btnExecuteSherlock.onclick = executeSherlockFromInputs;
    }

    // Context Menu: Abrir ubicación del archivo
    if (el.ctxMenuOpenLocation) {
      el.ctxMenuOpenLocation.onclick = async () => {
        closeAllMenus();
        closeFileContextMenu();
        const item = state.contextTargetItem || (state.selectedIndex >= 0 ? state.filteredItems[state.selectedIndex] : null);
        if (!item || !item.path) return;
        const isWindows = /^[a-zA-Z]:[\\\/]/.test(item.path) || item.path.startsWith('\\\\');
        const sep = isWindows ? '\\' : '/';
        const norm = isWindows ? item.path.replace(/\//g, '\\') : item.path.replace(/\\/g, '/');
        const lastSlash = norm.lastIndexOf(sep);
        if (lastSlash > 0) {
          const parentDir = norm.substring(0, lastSlash);
          await loadDirectory(parentDir);
          const targetName = item.name.toLowerCase();
          const targetPath = item.path.toLowerCase();
          const idx = state.filteredItems.findIndex(i => i.path.toLowerCase() === targetPath || i.name.toLowerCase() === targetName);
          if (idx >= 0) {
            setSelectionIndex(idx);
          }
        }
      };
    }
  }

  // Start app
  window.addEventListener('DOMContentLoaded', init);
})();
