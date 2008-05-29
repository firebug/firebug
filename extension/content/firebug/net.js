/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;
const nsIWebProgressListener = Ci.nsIWebProgressListener;
const nsIWebProgress = Ci.nsIWebProgress;
const nsIRequest = Ci.nsIRequest;
const nsIChannel = Ci.nsIChannel;
const nsIHttpChannel = Ci.nsIHttpChannel;
const nsICacheService = Ci.nsICacheService;
const nsICache = Ci.nsICache;
const nsIObserverService = Ci.nsIObserverService;
const nsISupportsWeakReference = Ci.nsISupportsWeakReference;
const nsISupports = Ci.nsISupports;
const nsIIOService = Ci.nsIIOService;
const imgIRequest = Ci.imgIRequest;
const nsIUploadChannel = Ci.nsIUploadChannel;
const nsIXMLHttpRequest = Ci.nsIXMLHttpRequest;
const nsISeekableStream = Ci.nsISeekableStream;
const nsIURI = Ci.nsIURI;

const CacheService = Cc["@mozilla.org/network/cache-service;1"];
const ImgCache = Cc["@mozilla.org/image/cache;1"];
const IOService = Cc["@mozilla.org/network/io-service;1"];

const nsIPrefBranch2 = Ci.nsIPrefBranch2;
const PrefService = Cc["@mozilla.org/preferences-service;1"];
const prefs = PrefService.getService(nsIPrefBranch2);

const NOTIFY_ALL = nsIWebProgress.NOTIFY_ALL;

const STATE_IS_WINDOW = nsIWebProgressListener.STATE_IS_WINDOW;
const STATE_IS_DOCUMENT = nsIWebProgressListener.STATE_IS_DOCUMENT;
const STATE_IS_NETWORK = nsIWebProgressListener.STATE_IS_NETWORK;
const STATE_IS_REQUEST = nsIWebProgressListener.STATE_IS_REQUEST;

const STATE_START = nsIWebProgressListener.STATE_START;
const STATE_STOP = nsIWebProgressListener.STATE_STOP;
const STATE_TRANSFERRING = nsIWebProgressListener.STATE_TRANSFERRING;

const LOAD_BACKGROUND = nsIRequest.LOAD_BACKGROUND;
const LOAD_FROM_CACHE = nsIRequest.LOAD_FROM_CACHE;
const LOAD_DOCUMENT_URI = nsIChannel.LOAD_DOCUMENT_URI;

const ACCESS_READ = nsICache.ACCESS_READ;
const STORE_ANYWHERE = nsICache.STORE_ANYWHERE;

const NS_ERROR_CACHE_KEY_NOT_FOUND = 0x804B003D;
const NS_ERROR_CACHE_WAIT_FOR_VALIDATION = 0x804B0040;

const NS_SEEK_SET = nsISeekableStream.NS_SEEK_SET;

const observerService = CCSV("@mozilla.org/observer-service;1", "nsIObserverService");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const mimeExtensionMap =
{
    "txt": "text/plain",
    "html": "text/html",
    "htm": "text/html",
    "xhtml": "text/html",
    "xml": "text/xml",
    "css": "text/css",
    "js": "application/x-javascript",
    "jss": "application/x-javascript",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "png": "image/png",
    "bmp": "image/bmp",
    "swf": "application/x-shockwave-flash"
};

const fileCategories =
{
    "undefined": 1,
    "html": 1,
    "css": 1,
    "js": 1,
    "xhr": 1,
    "image": 1,
    "flash": 1,
    "txt": 1,
    "bin": 1
};

const textFileCategories =
{
    "txt": 1,
    "html": 1,
    "xhr": 1,
    "css": 1,
    "js": 1
};

const binaryFileCategories =
{
    "bin": 1,
    "flash": 1
};

const mimeCategoryMap =
{
    "text/plain": "txt",
    "application/octet-stream": "bin",
    "text/html": "html",
    "text/xml": "html",
    "text/css": "css",
    "application/x-javascript": "js",
    "text/javascript": "js",
    "application/javascript" : "js",
    "image/jpeg": "image",
    "image/gif": "image",
    "image/png": "image",
    "image/bmp": "image",
    "application/x-shockwave-flash": "flash"
};

const binaryCategoryMap =
{
    "image": 1,
    "flash" : 1
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

const reIgnore = /about:|javascript:|resource:|chrome:|jar:/;

const layoutInterval = 300;
const phaseInterval = 1000;
const indentWidth = 18;
const maxPendingCheck = 200;

var cacheSession = null;

var contexts = new Array();
var panelName = "net";
var maxQueueRequests = 500;

var panelBar1 = $("fbPanelBar1");

// ************************************************************************************************

Firebug.NetMonitor = extend(Firebug.ActivableModule,
{
    clear: function(context)
    {
        // The user pressed a Clear button so, remove content of the panel...
        var panel = context.getPanel(panelName, true);
        if (panel)
            panel.clear();

        // ... and clear the network context.
        if (context.netProgress)
            context.netProgress.clear();
    },

    onToggleFilter: function(context, filterCategory)
    {
        if (!context.netProgress)
            return;

        Firebug.setPref(Firebug.prefDomain, "netFilterCategory", filterCategory);

        // The content filter has been changed. Make sure that the content
        // of the panel is updated (CSS is used to hide or show individual files).
        var panel = context.getPanel(panelName, true);
        if (panel)
        {
            panel.setFilter(filterCategory);
            panel.updateSummaries(now(), true);
        }
    },

    syncFilterButtons: function(chrome)
    {
        var button = chrome.$("fbNetFilter-" + Firebug.netFilterCategory);
        button.checked = true;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Module

    initializeUI: function()
    {
        // Initialize max limit for logged requests.
        NetLimit.updateMaxLimit();

        // Synchronize UI buttons with the current filter.
        this.syncFilterButtons(FirebugChrome);

        // Register HTTP observer for all net-request monitoring and time measuring.
        // This is done as soon as the FB UI is loaded.
        observerService.addObserver(HttpObserver, "http-on-modify-request", false);
        observerService.addObserver(HttpObserver, "http-on-examine-response", false);

        prefs.addObserver(Firebug.prefDomain, NetLimit, false);
    },

    initialize: function()
    {
        this.panelName = panelName;
        this.menuTooltip = $("fbNetStateMenuTooltip");
        this.menuButton = $("fbNetStateMenu");
        this.description = $STR("net.modulemanager.description");

        Firebug.ActivableModule.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        // Unregister HTTP observer. This is done when the FB UI is closed.
        observerService.removeObserver(HttpObserver, "http-on-modify-request");
        observerService.removeObserver(HttpObserver, "http-on-examine-response");

        prefs.removeObserver(Firebug.prefDomain, this, false);
    },

    initContext: function(context)
    {
        Firebug.ActivableModule.initContext.apply(this, arguments);
    },

    reattachContext: function(browser, context)
    {
        Firebug.ActivableModule.reattachContext.apply(this, arguments);
        var chrome = context ? context.chrome : FirebugChrome;
        this.syncFilterButtons(chrome);

        this.menuTooltip = chrome.$("fbNetStateMenuTooltip");
        this.menuButton = chrome.$("fbNetStateMenu");
    },

    destroyContext: function(context)
    {
        Firebug.ActivableModule.destroyContext.apply(this, arguments);
    },

    showContext: function(browser, context)
    {
        Firebug.ActivableModule.showContext.apply(this, arguments);

        if (!context)
        {
            var tabId = Firebug.getTabIdForWindow(browser.contentWindow);
            delete contexts[tabId];
        }
    },

    loadedContext: function(context)
    {
        if (context.netProgress)
            context.netProgress.loaded = true;
    },

    onModuleActivate: function(context, init)
    {
        monitorContext(context);

        this.enablePanel(context);

        $('fbStatusIcon').setAttribute("net", "on");

        if (!init)
            context.window.location.reload();
    },

    onModuleDeactivate: function(context, destroy)
    {
        unmonitorContext(context);
    },

    onLastModuleDeactivate: function(context, destroy)
    {
        $('fbStatusIcon').removeAttribute("net");
    },

});

// ************************************************************************************************

function NetPanel() {}

NetPanel.prototype = domplate(Firebug.Panel,
{
    tableTag:
        TABLE({class: "netTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY(
                TR(
                    TD({width: "18%"}),
                    TD({width: "12%"}),
                    TD({width: "12%"}),
                    TD({width: "4%"}),
                    TD({width: "54%"})
                )
            )
        ),

    fileTag:
        FOR("file", "$files",
            TR({class: "netRow $file.file|getCategory",
                $collapsed: "$file.file|hideRow",
                $hasHeaders: "$file.file|hasResponseHeaders",
                $loaded: "$file.file.loaded", $responseError: "$file.file|isError",
                $fromCache: "$file.file.fromCache", $inFrame: "$file.file|getInFrame"},
                TD({class: "netHrefCol netCol"},
                    DIV({class: "netHrefLabel netLabel",
                         style: "margin-left: $file.file|getIndent\\px"},
                        "$file.file|getHref"
                    ),
                    DIV({class: "netFullHrefLabel netHrefLabel netLabel",
                         style: "margin-left: $file.file|getIndent\\px"},
                        "$file.file.href"
                    )
                ),
                TD({class: "netStatusCol netCol"},
                    DIV({class: "netStatusLabel netLabel"}, "$file.file|getStatus")
                ),
                TD({class: "netDomainCol netCol"},
                    DIV({class: "netDomainLabel netLabel"}, "$file.file|getDomain")
                ),
                TD({class: "netSizeCol netCol"},
                    DIV({class: "netSizeLabel netLabel"}, "$file.file|getSize")
                ),
                TD({class: "netTimeCol netCol"},
                    DIV({class: "netBar"},
                        "&nbsp;",
                        DIV({class: "netTotalBar", style: "left: $file.offset"}),
                        DIV({class: "netTimeBar", style: "left: $file.offset; width: $file.width"},
                            SPAN({class: "netTimeLabel"}, "$file.elapsed|formatTime")
                        )
                    )
                )
            )
        ),

    headTag:
        TR({class: "netHeadRow"},
            TD({class: "netHeadCol", colspan: 5},
                DIV({class: "netHeadLabel"}, "$doc.rootFile.href")
            )
        ),

    netInfoTag:
        TR({class: "netInfoRow"},
            TD({class: "netInfoCol", colspan: 5})
        ),

    summaryTag:
        TR({class: "netRow netSummaryRow"},
            TD({class: "netCol"},
                DIV({class: "netCountLabel netSummaryLabel"}, "-")
            ),
            TD({class: "netCol"}),
            TD({class: "netCol"}),
            TD({class: "netTotalSizeCol netCol"},
                DIV({class: "netTotalSizeLabel netSummaryLabel"}, "0KB")
            ),
            TD({class: "netTotalTimeCol netCol"},
                DIV({class: "netBar"},
                    DIV({class: "netCacheSizeLabel netSummaryLabel"},
                        "(",
                        SPAN("0KB"),
                        SPAN(" " + $STR("FromCache")),
                        ")"
                    ),
                    DIV({class: "netTotalBar"}),
                    DIV({class: "netTimeBar", style: "width: 100%"},
                        SPAN({class: "netTotalTimeLabel netSummaryLabel"}, "0ms")
                    )
                )
            )
        ),

    getCategory: function(file)
    {
        var category = getFileCategory(file);
        if (category)
            return "category-" + category;

        return "";
    },

    hideRow: function(file)
    {
        return !file.loaded;
    },

    getInFrame: function(file)
    {
        return !!file.document.parent;
    },

    getIndent: function(file)
    {
        // XXXjoe Turn off indenting for now, it's confusing since we don't
        // actually place nested files directly below their parent
        //return file.document.level * indentWidth;
        return 0;
    },

    isError: function(file)
    {
        var errorRange = Math.floor(file.status/100);
        return errorRange == 4 || errorRange == 5;
    },

    summarizePhase: function(phase, rightNow)
    {
        var cachedSize = 0, totalSize = 0;

        var category = Firebug.netFilterCategory;
        if (category == "all")
            category = null;

        var fileCount = 0;
        var minTime = 0, maxTime = 0;

        for (var i=0; i<phase.files.length; i++)
        {
            var file = phase.files[i];

            if (!category || file.category == category)
            {
                if (file.loaded)
                {
                    ++fileCount;

                    if (file.size > 0)
                    {
                        totalSize += file.size;
                        if (file.fromCache)
                            cachedSize += file.size;
                    }

                    if (!minTime || file.startTime < minTime)
                        minTime = file.startTime;
                    if (file.endTime > maxTime)
                        maxTime = file.endTime;
                }
            }
        }

        var totalTime = maxTime - minTime;
        return {cachedSize: cachedSize, totalSize: totalSize, totalTime: totalTime,
                fileCount: fileCount}
    },

    getHref: function(file)
    {
        return (file.method ? file.method.toUpperCase() : "?") + " " + getFileName(file.href);
    },

    getStatus: function(file)
    {
        if (file.responseStatus && file.responseStatusText)
          return file.responseStatus + " " + file.responseStatusText;

        return "&nbsp;";
    },

    getDomain: function(file)
    {
        return getPrettyDomain(file.href);
    },

    getSize: function(file)
    {
        return this.formatSize(file.size);
    },

    hasResponseHeaders: function(file)
    {
        return !!file.responseHeaders;
    },

    formatSize: function(bytes)
    {
        if (bytes == -1 || bytes == undefined)
            return "?";
        else if (bytes < 1000)
            return bytes + " B";
        else if (bytes < 1000000)
            return Math.ceil(bytes/1000) + " KB";
        else
            return (Math.ceil(bytes/10000)/100) + " MB";
    },

    formatTime: function(elapsed)
    {
        // Use formatTime util from the lib.
        return formatTime(elapsed);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    onClick: function(event)
    {
        if (isLeftClick(event))
        {
            var row = getAncestorByClass(event.target, "netRow");
            if (row)
            {
                this.toggleHeadersRow(row);
                cancelEvent(event);
            }
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    clear: function()
    {
        clearNode(this.panelNode);

        this.table = null;
        this.summaryRow = null;
        this.limitRow = null;

        this.queue = [];
        this.invalidPhases = false;
    },

    setFilter: function(filterCategory)
    {
        this.filterCategory = filterCategory;

        var panelNode = this.panelNode;
        for (var category in fileCategories)
        {
            if (filterCategory != "all" && category != filterCategory)
                setClass(panelNode, "hideCategory-"+category);
            else
                removeClass(panelNode, "hideCategory-"+category);
        }
    },

    toggleHeadersRow: function(row)
    {
        if (!hasClass(row, "hasHeaders"))
            return;

        toggleClass(row, "opened");

        if (hasClass(row, "opened"))
        {
            var template = Firebug.NetMonitor.NetInfoBody;

            var netInfoRow = this.netInfoTag.insertRows({}, row)[0];
            var netInfo = template.tag.replace({file: row.repObject}, netInfoRow.firstChild);
            template.selectTabByName(netInfo, "Headers");

            setClass(netInfo, "category-" + getFileCategory(row.repObject));
        }
        else
        {
            row.parentNode.removeChild(row.nextSibling);
        }
    },

    copyParams: function(file)
    {
        var text = getPostText(file, this.context);

        var lines = text.split("\n");
        var params = parseURLEncodedText(lines[lines.length-1]);

        var args = [];
        for (var i = 0; i < params.length; ++i)
            args.push(escape(params[i].name)+"="+escape(params[i].value));

        var url = file.href;
        url += (url.indexOf("?") == -1 ? "?" : "&") + args.join("&");

        copyToClipboard(url);
    },

    copyHeaders: function(headers)
    {
        var lines = [];
        if (headers)
        {
            for (var i = 0; i < headers.length; ++i)
            {
                var header = headers[i];
                lines.push(header.name + ": " + header.value);
            }
        }

        var text = lines.join("\r\n");
        copyToClipboard(text);
    },

    copyResponse: function(file)
    {
        var text = file.responseText
            ? file.responseText
            : this.context.sourceCache.loadText(file.href);

        copyToClipboard(text);
    },

    stopLoading: function(file)
    {
        const NS_BINDING_ABORTED = 0x804b0002;

        file.request.cancel(NS_BINDING_ABORTED);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // extends Panel

    name: panelName,
    searchable: true,
    editable: false,

    initialize: function(context, doc)
    {
        this.queue = [];

        Firebug.Panel.initialize.apply(this, arguments);
    },

    destroy: function(state)
    {
        Firebug.Panel.destroy.apply(this, arguments);
    },

    show: function(state)
    {
        this.showToolbarButtons("fbNetButtons", true);

        Firebug.NetMonitor.menuUpdate(this.context);

        var shouldShow = this.shouldShow();
        this.showToolbarButtons("fbNetButtonsFilter", shouldShow);
        if (!shouldShow)
            return;

        if (!this.filterCategory)
            this.setFilter(Firebug.netFilterCategory);

        if (this.context.netProgress)
            this.context.netProgress.activate(this);

        this.layout();
        this.layoutInterval = setInterval(bindFixed(this.updateLayout, this), layoutInterval);

        if (this.wasScrolledToBottom)
            scrollToBottom(this.panelNode);
    },

    shouldShow: function()
    {
        if (Firebug.NetMonitor.isEnabled(this.context))
            return true;

        Firebug.ModuleManagerPage.show(this);

        return false;
    },

    hide: function()
    {
        this.showToolbarButtons("fbNetButtons", false);

        if (this.context.netProgress)
          this.context.netProgress.activate(null);

        this.wasScrolledToBottom = isScrolledToBottom(this.panelNode);

        clearInterval(this.layoutInterval);
        delete this.layoutInterval;
    },

    updateOption: function(name, value)
    {
        if (name == "netFilterCategory")
        {
            Firebug.NetMonitor.syncFilterButtons(this.context.chrome);
            for (var i = 0; i < TabWatcher.contexts.length; ++i)
            {
                var context = TabWatcher.contexts[i];
                Firebug.NetMonitor.onToggleFilter(context, value);
            }
        }
    },

    getOptionsMenuItems: function()
    {
        return [];
    },

    getContextMenuItems: function(nada, target)
    {
        var items = [];

        var file = Firebug.getRepObject(target);
        if (!file)
            return items;

        var object = Firebug.getObjectByURL(this.context, file.href);
        var isPost = isURLEncodedFile(file, getPostText(file, this.context));

        items.push(
            {label: "CopyLocation", command: bindFixed(copyToClipboard, FBL, file.href) }
        );

        if (isPost)
        {
            items.push(
                {label: "CopyLocationParameters", command: bindFixed(this.copyParams, this, file) }
            );
        }

        items.push(
            {label: "CopyRequestHeaders",
                command: bindFixed(this.copyHeaders, this, file.requestHeaders) },
            {label: "CopyResponseHeaders",
                command: bindFixed(this.copyHeaders, this, file.responseHeaders) }
        );

        if ( textFileCategories.hasOwnProperty(file.category) )
        {
            items.push(
                {label: "CopyResponse", command: bindFixed(this.copyResponse, this, file) }
            );
        }

        items.push(
            "-",
            {label: "OpenInTab", command: bindFixed(openNewTab, FBL, file.href) }
        );

        if (!file.loaded)
        {
            items.push(
                "-",
                {label: "StopLoading", command: bindFixed(this.stopLoading, this, file) }
            );
        }

        if (object)
        {
            var subItems = FirebugChrome.getInspectMenuItems(object);
            if (subItems.length)
            {
                items.push("-");
                items.push.apply(items, subItems);
            }
        }

        return items;
    },

    showInfoTip: function(infoTip, target, x, y)
    {
        var row = getAncestorByClass(target, "netRow");
        if (row)
        {
            if (hasClass(row, "category-image"))
            {
                var url = row.repObject.href;
                if (url == this.infoTipURL)
                    return true;

                this.infoTipURL = url;
                return Firebug.InfoTip.populateImageInfoTip(infoTip, url);
            }
        }
    },

    search: function(text)
    {
        if (!text)
        {
            delete this.currentSearch;
            return false;
        }

        var row;
        if (this.currentSearch && text == this.currentSearch.text)
            row = this.currentSearch.findNext(true);
        else
        {
            function findRow(node) { return getAncestorByClass(node, "netRow"); }
            this.currentSearch = new TextSearch(this.panelNode, findRow);
            row = this.currentSearch.find(text);
        }

        if (row)
        {
            var sel = this.document.defaultView.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.currentSearch.range);

            scrollIntoCenterView(row, this.panelNode);
            return true;
        }
        else
            return false;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    updateFile: function(file)
    {
        if (!file.invalid)
        {
            file.invalid = true;
            this.queue.push(file);
        }
    },

    invalidatePhase: function(phase)
    {
        if (phase && !phase.invalidPhase)
        {
            phase.invalidPhase = true;
            this.invalidPhases = true;
        }
    },

    updateLayout: function()
    {
        if (!this.queue.length)
            return;

        var scrolledToBottom = isScrolledToBottom(this.panelNode);

        this.layout();

        if (scrolledToBottom)
            scrollToBottom(this.panelNode);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    layout: function()
    {
        if (!this.queue.length || !this.context.netProgress ||
            !Firebug.NetMonitor.isEnabled(this.context))
            return;

        if (!this.table)
        {
            var limitInfo = {
                totalCount: 0,
                limitPrefsTitle: $STRF("LimitPrefsTitle", ["extensions.firebug.net.logLimit"])
            };

            this.table = this.tableTag.replace({}, this.panelNode, this);
            this.limitRow = NetLimit.createRow(this.table.firstChild, limitInfo);
            this.summaryRow =  this.summaryTag.insertRows({}, this.table.lastChild.lastChild)[0];
        }

        var rightNow = now();

        this.updateRowData(rightNow);
        this.updateLogLimit(maxQueueRequests);
        this.updateTimeline(rightNow);
        this.updateSummaries(rightNow);
    },

    updateRowData: function(rightNow)
    {
        var queue = this.queue;
        this.queue = [];

        var phase;
        var newFileData = [];

        for (var i = 0; i < queue.length; ++i)
        {
            var file = queue[i];
            if (!file.phase)
              continue;

            file.invalid = false;

            phase = this.calculateFileTimes(file, phase, rightNow);

            this.updateFileRow(file, newFileData);
            this.invalidatePhase(phase);
        }

        if (newFileData.length)
        {
            var tbody = this.table.firstChild;
            var lastRow = tbody.lastChild.previousSibling;
            var row = this.fileTag.insertRows({files: newFileData}, lastRow)[0];

            for (var i = 0; i < newFileData.length; ++i)
            {
                var file = newFileData[i].file;
                row.repObject = file;
                file.row = row;
                row = row.nextSibling;
            }
        }
    },

    updateFileRow: function(file, newFileData)
    {
        var row = file.row;
        if (file.toRemove)
        {
            this.removeLogEntry(file, true);
        }
        else if (!row)
        {
              newFileData.push({
                      file: file,
                      offset: this.barOffset + "%",
                      width: this.barWidth + "%",
                      elapsed: file.loaded ? this.elapsed : -1
              });
        }
        else
        {
            var sizeLabel = row.childNodes[3].firstChild;
            sizeLabel.firstChild.nodeValue = this.getSize(file);

            var methodLabel = row.childNodes[1].firstChild;
            methodLabel.firstChild.nodeValue = this.getStatus(file);

            var hrefLabel = row.childNodes[0].firstChild;
            hrefLabel.firstChild.nodeValue = this.getHref(file);

            if (file.mimeType && !file.category)
            {
                removeClass(row, "category-undefined");
                setClass(row, "category-"+getFileCategory(file));
            }

            if (file.responseHeaders)
                setClass(row, "hasHeaders");

            if (file.fromCache)
                setClass(row, "fromCache");
            else
                removeClass(row, "fromCache");

            if (this.isError(file))
            {
                setClass(row, "responseError");

                var hrefLabel = row.firstChild.firstChild.firstChild;
                hrefLabel.nodeValue = this.getHref(file);
            }

            var timeLabel = row.childNodes[4].firstChild.lastChild.firstChild;

            if (file.loaded)
            {
                removeClass(row, "collapsed");
                setClass(row, "loaded");
                timeLabel.innerHTML = this.formatTime(this.elapsed);
            }
            else
            {
                removeClass(row, "loaded");
                timeLabel.innerHTML = "&nbsp;";
            }

            if (hasClass(row, "opened"))
            {
                var netInfoBox = row.nextSibling.firstChild.firstChild;
                Firebug.NetMonitor.NetInfoBody.updateInfo(netInfoBox, file, this.context);
            }
        }
    },

    updateTimeline: function(rightNow)
    {
        //var rootFile = this.context.netProgress.rootFile; // XXXjjb never read?
        var tbody = this.table.firstChild;

        // XXXjoe Don't update rows whose phase is done and layed out already
        var phase;
        for (var row = tbody.firstChild; row; row = row.nextSibling)
        {
            var file = row.repObject;

            // Some rows aren't associated with a file (e.g. header, sumarry).
            if (!file)
                continue;

            phase = this.calculateFileTimes(file, phase, rightNow);

            var totalBar = row.childNodes[4].firstChild.childNodes[1];
            var timeBar = totalBar.nextSibling;

            totalBar.style.left = timeBar.style.left = this.barOffset + "%";
            timeBar.style.width = this.barWidth + "%";
        }
    },

    updateSummaries: function(rightNow, updateAll)
    {
        if (!this.invalidPhases && !updateAll)
            return;

        this.invalidPhases = false;

        var phases = this.context.netProgress.phases;
        if (!phases.length)
            return;

        var fileCount = 0, totalSize = 0, cachedSize = 0, totalTime = 0;
        for (var i = 0; i < phases.length; ++i)
        {
            var phase = phases[i];
            phase.invalidPhase = false;

            var summary = this.summarizePhase(phase, rightNow);
            fileCount += summary.fileCount;
            totalSize += summary.totalSize;
            cachedSize += summary.cachedSize;
            totalTime += summary.totalTime
        }

        var row = this.summaryRow;
        if (!row)
            return;

        var countLabel = row.firstChild.firstChild;
        countLabel.firstChild.nodeValue = fileCount == 1
            ? $STR("Request")
            : $STRF("RequestCount", [fileCount]);

        var sizeLabel = row.childNodes[3].firstChild;
        sizeLabel.firstChild.nodeValue = this.formatSize(totalSize);

        var cacheSizeLabel = row.lastChild.firstChild.firstChild;
        cacheSizeLabel.setAttribute("collapsed", cachedSize == 0);
        cacheSizeLabel.childNodes[1].firstChild.nodeValue = this.formatSize(cachedSize);

        var timeLabel = row.lastChild.firstChild.lastChild.firstChild;
        timeLabel.innerHTML = this.formatTime(totalTime);
    },

    calculateFileTimes: function(file, phase, rightNow)
    {
        if (phase != file.phase)
        {
            phase = file.phase;
            this.phaseStartTime = phase.startTime;
            this.phaseEndTime = phase.endTime ? phase.endTime : rightNow;
            this.phaseElapsed = this.phaseEndTime - phase.startTime;
        }

        this.elapsed = file.loaded ? file.endTime - file.startTime : this.phaseEndTime - file.startTime;
        this.barWidth = Math.floor((this.elapsed/this.phaseElapsed) * 100);
        this.barOffset = Math.floor(((file.startTime-this.phaseStartTime)/this.phaseElapsed) * 100);

        return phase;
    },

    updateLogLimit: function(limit)
    {
        var netProgress = this.context.netProgress;

        // Must be positive number;
        limit = Math.max(0, limit) + netProgress.pending.length;

        var files = netProgress.files;
        var filesLength = files.length;
        if (!filesLength || filesLength <= limit)
            return;

        // Remove old requests.
        var removeCount = Math.max(0, filesLength - limit);
        for (var i=0; i<removeCount; i++)
            this.removeLogEntry(files[0]);
    },

    removeLogEntry: function(file, noInfo)
    {
        if (!this.removeFile(file))
            return;

        if (!this.table || !this.table.firstChild)
            return;

        if (file.row)
        {
            // The file is loaded and there is a row that has to be removed from the UI.
            var tbody = this.table.firstChild;
            tbody.removeChild(file.row);
        }

        if (noInfo || !this.limitRow)
            return;

        this.limitRow.limitInfo.totalCount++;

        NetLimit.updateCounter(this.limitRow);

        //if (netProgress.currentPhase == file.phase)
        //  netProgress.currentPhase = null;
    },

    removeFile: function(file)
    {
        var netProgress = this.context.netProgress;
        var files = netProgress.files;
        var index = files.indexOf(file);
        if (index == -1)
            return false;

        var requests = netProgress.requests;
        var phases = netProgress.phases;

        files.splice(index, 1);
        requests.splice(index, 1);

        // Don't forget to remove the phase whose last file has been removed.
        var phase = file.phase;
        phase.removeFile(file);
        if (!phase.files.length)
        {
          remove(phases, phase);

          if (netProgress.currentPhase == phase)
            netProgress.currentPhase = null;
        }

        return true;
    }
});

// ************************************************************************************************

Firebug.NetMonitor.NetLimit = domplate(Firebug.Rep,
{
    collapsed: true,

    tableTag:
        DIV(
            TABLE({width: "100%", cellpadding: 0, cellspacing: 0},
                TBODY()
            )
        ),

    limitTag:
        TR({class: "netRow netLimitRow", $collapsed: "$isCollapsed"},
            TD({class: "netCol netLimitCol", colspan: 5},
                TABLE({cellpadding: 0, cellspacing: 0},
                    TBODY(
                        TR(
                            TD(
                                SPAN({class: "netLimitLabel"},
                                    $STR("LimitExceeded")
                                )
                            ),
                            TD({style: "width:100%"}),
                            TD(
                                BUTTON({class: "netLimitButton", title: "$limitPrefsTitle",
                                    onclick: "$onPreferences"},
                                  $STR("LimitPrefs")
                                )
                            ),
                            TD("&nbsp;")
                        )
                    )
                )
            )
        ),

    isCollapsed: function()
    {
        return this.collapsed;
    },

    onPreferences: function(event)
    {
        openNewTab("about:config");
    },

    updateCounter: function(row, count)
    {
        removeClass(row, "collapsed");

        // Update info within the limit row.
        var limitLabel = getElementByClass(row, "netLimitLabel");
        limitLabel.firstChild.nodeValue = $STRF("LimitExceeded", [row.limitInfo.totalCount]);
    },

    createTable: function(parent, limitInfo)
    {
        var table = this.tableTag.replace({}, parent);
        var row = this.createRow(table.firstChild.firstChild, limitInfo);
        return [table, row];
    },

    createRow: function(parent, limitInfo)
    {
        var row = this.limitTag.insertRows(limitInfo, parent, this)[0];
        row.limitInfo = limitInfo;
        return row;
    },

    // nsIPrefObserver
    observe: function(subject, topic, data)
    {
        // We're observing preferences only.
        if (topic != "nsPref:changed")
          return;

        if (data.indexOf("net.logLimit") != -1)
            this.updateMaxLimit();
    },

    updateMaxLimit: function()
    {
        var value = Firebug.getPref(Firebug.prefDomain, "net.logLimit");
        maxQueueRequests =  value ? value : maxQueueRequests;
    }
});

var NetLimit = Firebug.NetMonitor.NetLimit;

// ************************************************************************************************

function NetProgress(context)
{
    this.context = context;

    var queue = null;
    var requestQueue = null;
    var panel = null;

    this.post = function(handler, args)
    {
        // If the panel is currently active insert the file into it directly
        // otherwise wait and insert it in to a "queue". It'll be flushed
        // into the UI when the panel is displayed (see this.flush method).
        if (panel)
        {
            var file = handler.apply(this, args);
            if (file)
            {
                panel.updateFile(file);
                return file;
            }
        }
        else
        {
            // The newest request is always inserted into the queue.
            queue.push(handler, args);

            // Real number of requests (not posts!) is remembered.
            var request = args[0];
            if (requestQueue.indexOf(request) == -1)
              requestQueue.push(request);

            // If number of requests reaches the limit, let's start to remove them.
            if (requestQueue.length + this.files.length > (maxQueueRequests + this.pending.length))
            {
                var hiddenPanel = this.context.getPanel(panelName, false);

                var request = requestQueue.splice(0, 1)[0];
                for (var i=0; i<queue.length; i+=2)
                {
                    if (queue[i+1][0] == request)
                    {
                        var file = queue[i].apply(this, queue[i+1]);
                        if (file) {
                            hiddenPanel.updateFile(file);
                        }

                        queue.splice(i, 2);
                        i -= 2;
                    }
                }

                hiddenPanel.layout();
            }
        }
                                                                                                                       /*@explore*/
        if (FBTrace.DBG_NET)                                                                                           /*@explore*/
            FBTrace.dumpProperties( " net.post.args "+(panel?" applied":"queued @"+(queue.length-2))+                  /*@explore*/
                " "+handler.name, args);                                                                               /*@explore*/
    };

    this.flush = function()
    {
        for (var i = 0; i < queue.length; i += 2)
        {
            if (FBTrace.DBG_NET)                                                                                       /*@explore*/
            {                                                                                                          /*@explore*/
                FBTrace.dumpProperties("net.flush handler("+i+")", queue[i]);                                          /*@explore*/
                FBTrace.dumpProperties("net.flush args ", queue[i+1]);                                                 /*@explore*/
            }                                                                                                          /*@explore*/
                                                                                                                       /*@explore*/
            var file = queue[i].apply(this, queue[i+1]);
            if (file)
                panel.updateFile(file);
        }

        queue = [];
        requestQueue = [];
    };

    this.activate = function(activePanel)
    {
        // As soon as the panel is activated flush all the "queued"
        // files into the UI.
        this.panel = panel = activePanel;
        if (panel)
            this.flush();
    };

    this.update = function(file)
    {
        if (panel)
            panel.updateFile(file);
    };

    this.clear = function()
    {
        this.requests = [];
        this.files = [];
        this.phases = [];
        this.documents = [];
        this.windows = [];

        queue = [];
        requestQueue = [];
    };

    this.clear();
}

NetProgress.prototype =
{
    panel: null,
    pending: [],

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    respondedTopWindow: function(request, time, webProgress)
    {
        var win = webProgress ? safeGetWindow(webProgress) : null;
        this.requestedFile(request, time, win);
        return this.respondedFile(request, time);
    },

    requestedFile: function requestedFile(request, time, win, category) // XXXjjb 3rd arg was webProgress, pulled safeGetWindow up
    {
        // XXXjjb to allow spy to pass win.  var win = webProgress ? safeGetWindow(webProgress) : null;
        var file = this.getRequestFile(request, win);
        if (file)
        {
            // For cached image files, we may never hear another peep from any observers
            // after this point, so we have to assume that the file is cached and loaded
            // until we get a respondedFile call later
            file.startTime = file.endTime = time;
            //file.fromCache = true;
            if (category && !file.category)
                file.category = category;

            file.isBackground = request.loadFlags & LOAD_BACKGROUND;

            this.awaitFile(request, file);
            this.extendPhase(file);

            if (FBTrace.DBG_NET)                                                                      /*@explore*/
                FBTrace.dumpProperties("net.requestedFile="+file.href, file);                               /*@explore*/

            return file;
        }
        else                                                                                          /*@explore*/
        {                                                                                             /*@explore*/
            if (FBTrace.DBG_NET)                                                                      /*@explore*/
                FBTrace.dumpProperties("net.requestedFile no file for request=", request);            /*@explore*/
        }                                                                                             /*@explore*/
    },

    respondedFile: function respondedFile(request, time, info)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            var endedAlready = !!file.endTime;

            file.respondedTime = time;
            file.endTime = time;

            if (request.contentLength > 0)
                file.size = request.contentLength;

            if (info.responseStatus == 304)
                file.fromCache = true;
            else if (!file.fromCache)
                file.fromCache = false;

            getHttpHeaders(request, file);

            file.responseStatus = info.responseStatus;
            file.responseStatusText = info.responseStatusText;
            file.postText = info.postText;

            // This is a strange but effective tactic for simulating the
            // load of background images, which we can't actually track.
            // If endTime was set before this, that means the cache request
            // came back, which only seems to happen for background images.
            // We thus end the load now, since we know we'll never hear
            // from these requests again.
            if (endedAlready)
                this.endLoad(file);

            this.arriveFile(file, request);

            if (file.fromCache)
                getCacheEntry(file, this);

            return file;
        }
    },

    progressFile: function progressFile(request, progress, expectedSize)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            file.size = progress;
            file.expectedSize = expectedSize;

            return file;
        }
    },

    stopFile: function stopFile(request, time, postText, responseText)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            file.endTime = time;
            file.postText = postText;
            file.responseText = responseText;

            // XXXjoe Nice work, pavlov.  This crashes randomly when it access decoderObserver.
            //file.sourceObject = getRequestElement(request);

            getHttpHeaders(request, file);

            this.arriveFile(file, request);

            // Don't mark this file as "loaded". Only request for which the http-on-examine-response
            // event is received is displayed within the list.
            //this.endLoad(file);

            getCacheEntry(file, this);

            return file;
        }
        else
        {                                                                                                          /*@explore*/
            if (FBTrace.DBG_NET) FBTrace.dumpProperties("stopfile no file for request=", request);                     /*@explore*/
        }
    },

    cacheEntryReady: function cacheEntryReady(request, file, size)
    {
        if (size != -1)
            file.size = size;

        if (file.loaded)
        {
            getHttpHeaders(request, file);
            this.arriveFile(file, request);
            return file;
        }

        // Don't update the UI.
        return null;
    },

    removeFile: function removeFile(request, file, size)
    {
        if (file.loaded)
          return;

        if (!this.pending.length)
        {
            this.context.clearInterval(this.pendingInterval);
            delete this.pendingInterval;
        }

        file.toRemove = true;
        return file;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    getRequestFile: function getRequestFile(request, win)
    {
        var name = safeGetName(request);
        if (!name || reIgnore.exec(name))
            return null;

        var index = this.requests.indexOf(request);
        if (index == -1)
        {
            if (!win || getRootWindow(win) != this.context.window)
                return;

            var fileDoc = this.getRequestDocument(win);
            var isDocument = request.loadFlags & LOAD_DOCUMENT_URI && fileDoc.parent;
            var doc = isDocument ? fileDoc.parent : fileDoc;

            var file = doc.createFile(request);
            if (isDocument)
            {
                fileDoc.documentFile = file;
                file.ownDocument = fileDoc;
            }

            file.request = request;
            this.requests.push(request);
            this.files.push(file);

            return file;
        }
        else
            return this.files[index];
    },

    getRequestDocument: function(win)
    {
        if (win)
        {
            var index = this.windows.indexOf(win);
            if (index == -1)
            {
                var doc = new NetDocument();
                if (win.parent != win)
                    doc.parent = this.getRequestDocument(win.parent);

                //doc.level = getFrameLevel(win);

                this.documents.push(doc);
                this.windows.push(win);

                return doc;
            }
            else
                return this.documents[index];
        }
        else
            return this.documents[0];
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    awaitFile: function(request, file)
    {
        this.pending.push(file);

        // XXXjoe Remove files after they have been checked N times
        if (!this.pendingInterval)
        {
            this.pendingInterval = this.context.setInterval(bindFixed(function()
            {
                for (var i = 0; i < this.pending.length; ++i)
                {
                    var file = this.pending[i];
                    if (file.pendingCount++ > maxPendingCheck)
                    {
                        this.pending.splice(i, 1);
                        --i;

                        this.post(cacheEntryReady, [request, file, 0]);
                        this.post(removeFile, [request, file, 0]);
                    }
                    else
                        waitForCacheCompletion(request, file, this);
                }
            }, this), 300);
        }
    },

    arriveFile: function(file, request)
    {
        if (FBTrace.DBG_NET)                                                                                           /*@explore*/
            FBTrace.sysout("net.arriveFile for file.href="+file.href+" and request.name="+safeGetName(request)+"\n");  /*@explore*/

        var index = this.pending.indexOf(file);
        if (index != -1)
            this.pending.splice(index, 1);

        if (!this.pending.length)
        {
            this.context.clearInterval(this.pendingInterval);
            delete this.pendingInterval;
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    endLoad: function(file)
    {
        // Set file as loaded.
        file.loaded = true;

        // Update last finished file of the associated phase.
        file.phase.lastFinishedFile = file;
    },

    extendPhase: function(file)
    {
        if (this.currentPhase)
        {
            // If the new request has been started within a "phaseInterval" after the
            // previous reqeust has been started, associate it with the current phase;
            // otherwise create a new phase.
            var lastStartTime = this.currentPhase.lastStartTime;
            if (this.loaded && file.startTime - lastStartTime >= phaseInterval)
                this.startPhase(file);
            else
                this.currentPhase.addFile(file);
        }
        else
        {
            // If there is no phase yet, just create it.
            this.startPhase(file);
        }
    },

    startPhase: function(file)
    {
        var phase = new NetPhase(file);

        this.currentPhase = phase;
        this.phases.push(phase);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsISupports

    QueryInterface: function(iid)
    {
        if (iid.equals(nsIWebProgressListener)
            || iid.equals(nsISupportsWeakReference)
            || iid.equals(nsISupports))
        {
            return this;
        }

        throw Components.results.NS_NOINTERFACE;
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsIWebProgressListener

    onStateChange: function(progress, request, flag, status)
    {
    },

    onProgressChange : function(progress, request, current, max, total, maxTotal)
    {
        // Log progress information only for real requests.
        if (this.requests.indexOf(request) != -1)
          this.post(progressFile, [request, current, max]);
    },

    stateIsRequest: false,
    onLocationChange: function() {},
    onStatusChange : function() {},
    onSecurityChange : function() {},
    onLinkIconAvailable : function() {}
};

var requestedFile = NetProgress.prototype.requestedFile;
var respondedTopWindow = NetProgress.prototype.respondedTopWindow;
var respondedFile = NetProgress.prototype.respondedFile;
var progressFile = NetProgress.prototype.progressFile;
var stopFile = NetProgress.prototype.stopFile;
var cacheEntryReady = NetProgress.prototype.cacheEntryReady;
var removeFile = NetProgress.prototype.removeFile;

// ************************************************************************************************

/**
 * A Document is a helpers objcet that represents a document (window) on the page.
 * This object is created for main page document and for every inner document
 * (within a document) for which a request is made.
 */
function NetDocument() { }

NetDocument.prototype =
{
    createFile: function(request)
    {
        return new NetFile(request.name, this);
    }
};

// ************************************************************************************************

/**
 * A File is a helper object that reprents a file for which a request is made.
 * The document refers to it's parent document (NetDocument) through a member
 * variable.
 */
function NetFile(href, document)
{
    this.href = href;
    this.document = document

    if (FBTrace.DBG_NET)                                                                                                /*@explore*/
        FBTrace.dumpProperties("net.NetFile: "+href, this);                                                                        /*@explore*/

    this.pendingCount = 0;
}

NetFile.prototype =
{
    status: 0,
    files: 0,
    loaded: false,
    fromCache: false,
    size: -1,
    expectedSize: -1,
    endTime: null
};

Firebug.NetFile = NetFile;

// ************************************************************************************************

/**
 * A Phase is a helper object that groups requests made in the same time frame.
 * In other words, if a new requests is started within a given time (specified
 * by phaseInterval [ms]) - after previous request has been started -
 * it automatically belongs to the same phase.
 * If a request is started after this period, a new phase is created
 * and this file becomes to be the first in that phase.
 * The first phase is ended when the page finishes it's loading. Other phases
 * might be started by additional XHR made by the page.
 *
 * All phases are stored within NetProgress.phases array.
 *
 * Phases are used to compute size of the graphical timeline. The timeline
 * for each phase starts from the begining of the graph.
 */
function NetPhase(file)
{
  // Start time of the phase. Remains the same, even if the file
  // is removed from the log (due to a max limit of entries).
  // This ensures stability of the time line.
  this.startTime = file.startTime;

  // The last finished request (file) in the phase.
  this.lastFinishedFile = null;

  // Set to true if the phase needs to be updated in the UI.
  this.invalidPhase = null;

  // List of files associated with this phase.
  this.files = [];

  this.addFile(file);
}

NetPhase.prototype =
{
    addFile: function(file)
    {
        this.files.push(file);
        file.phase = this;
    },

    removeFile: function removeFile(file)
    {
        remove(this.files, file);
        file.phase = null;

        // If the last file has been removed, update the last file member.
        if (file == this.lastFinishedFile)
        {
          if (this.files.length == 0)
          {
            this.lastFinishedFile = null;
          }
          else
          {
            for (var i=0; i<this.files.length; i++) {
              if (this.lastFinishedFile.endTime < this.files[i].endTime)
                this.lastFinishedFile = this.files[i];
            }
          }
        }
    },

    get lastStartTime()
    {
      return this.files[this.files.length - 1].startTime;
    },

    get endTime()
    {
      return this.lastFinishedFile ? this.lastFinishedFile.endTime : null;
    }
};

// ************************************************************************************************
// Local Helpers

function monitorContext(context)
{
    if (!context.netProgress)
    {
        var networkContext = null;

        // Use an existing context associated with the browser tab if any
        // or create a pure new network context.
        var tabId = Firebug.getTabIdForWindow(context.window);
        networkContext = contexts[tabId];
        if (networkContext) {
          networkContext.context = context;
          delete contexts[tabId];
        }
        else {
          networkContext = new NetProgress(context);
        }

        var listener = context.netProgress = networkContext;

        // This listener is used to observe downlaod progress.
        context.browser.addProgressListener(listener, NOTIFY_ALL);
    }
}

function unmonitorContext(context)
{
    var netProgress = context.netProgress;
    if (netProgress)
    {
        if (netProgress.pendingInterval)
        {
            context.clearInterval(netProgress.pendingInterval);
            delete netProgress.pendingInterval;

            netProgress.pending.splice(0, netProgress.pending.length);
        }

        if (context.browser.docShell)
            context.browser.removeProgressListener(netProgress, NOTIFY_ALL);

        delete context.netProgress;
    }
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function initCacheSession()
{
    if (!cacheSession)
    {
        var cacheService = CacheService.getService(nsICacheService);
        cacheSession = cacheService.createSession("HTTP", STORE_ANYWHERE, true);
        cacheSession.doomEntriesIfExpired = false;
    }
}

function waitForCacheCompletion(request, file, netProgress)
{
    try
    {
        initCacheSession();
        var descriptor = cacheSession.openCacheEntry(file.href, ACCESS_READ, false);
        if (descriptor)
            netProgress.post(cacheEntryReady, [request, file, descriptor.dataSize]);
    }
    catch (exc)
    {
        if (exc.result != NS_ERROR_CACHE_WAIT_FOR_VALIDATION
            && exc.result != NS_ERROR_CACHE_KEY_NOT_FOUND)
        {
            ERROR(exc);
            netProgress.post(cacheEntryReady, [request, file, -1]);
        }
    }
}

function getCacheEntry(file, netProgress)
{
    // Pause first because this is usually called from stopFile, at which point
    // the file's cache entry is locked
    setTimeout(function()
    {
        try
        {
            initCacheSession();
            cacheSession.asyncOpenCacheEntry(file.href, ACCESS_READ, {
                onCacheEntryAvailable: function(descriptor, accessGranted, status)
                {
                    if (descriptor)
                    {
                        if(file.size == -1)
                        {
                            file.size = descriptor.dataSize;
                        }
                        if(descriptor.lastModified && descriptor.lastFetched &&
                            descriptor.lastModified < Math.floor(file.startTime/1000)) {
                            file.fromCache = true;
                        }
                        file.cacheEntry = [
                          { name: "Last Modified",
                            value: getDateFromSeconds(descriptor.lastModified)
                          },
                          { name: "Last Fetched",
                            value: getDateFromSeconds(descriptor.lastFetched)
                          },
                          { name: "Expires",
                            value: getDateFromSeconds(descriptor.expirationTime)
                          },
                          { name: "Data Size",
                            value: descriptor.dataSize
                          },
                          { name: "Fetch Count",
                            value: descriptor.fetchCount
                          },
                          { name: "Device",
                            value: descriptor.deviceID
                          }
                        ];

                        // Get contentType from the cache.
                        descriptor.visitMetaData({
                            visitMetaDataElement: function(key, value) {
                                if (key == "response-head")
                                {
                                    var contentType = getContentTypeFromResponseHead(value);
                                    file.mimeType = getMimeType(contentType, file.href);
                                    return false;
                                }

                                return true;
                            }
                        });

                        // Update file category.
                        if (file.mimeType)
                        {
                            file.category = null;
                            getFileCategory(file);
                        }

                        netProgress.update(file);
                    }
                }
            });
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                ERROR(exc);
        }
    });
}

function getContentTypeFromResponseHead(value)
{
    var values = value.split("\r\n");
    for (var i=0; i<values.length; i++)
    {
        var option = values[i].split(": ");
        if (option[0] == "Content-Type")
            return option[1];
    }
}

function getDateFromSeconds(s)
{
    var d = new Date();
    d.setTime(s*1000);
    return d;
}

function getHttpHeaders(request, file)
{
    try
    {
        var http = QI(request, nsIHttpChannel);
        file.method = http.requestMethod;
        file.status = request.responseStatus;
        file.urlParams = parseURLParams(file.href);

        if (!file.mimeType)
            file.mimeType = getMimeType(request.contentType, request.name);

        // Disable temporarily
        if (!file.responseHeaders && Firebug.collectHttpHeaders)
        {
            var requestHeaders = [], responseHeaders = [];

            http.visitRequestHeaders({
                visitHeader: function(name, value)
                {
                    requestHeaders.push({name: name, value: value});
                }
            });
            http.visitResponseHeaders({
                visitHeader: function(name, value)
                {
                    responseHeaders.push({name: name, value: value});
                }
            });

            file.requestHeaders = requestHeaders;
            file.responseHeaders = responseHeaders;
        }
    }
    catch (exc)
    {
    }
}

function getRequestWebProgress(request, netProgress)
{
    try
    {
        if (request.notificationCallbacks)
        {
            var bypass = false;
            if (request.notificationCallbacks instanceof XMLHttpRequest)
            {
                request.notificationCallbacks.channel.visitRequestHeaders(
                {
                    visitHeader: function(header, value)
                    {
                        if (header == "X-Moz" && value == "microsummary")
                            bypass = true;
                    }
                });
            }
            // XXXjjb Joe review: code above sets bypass, so this stmt should be in if (gives exceptions otherwise)
            if (!bypass)
            {
                var progress = GI(request.notificationCallbacks, nsIWebProgress);
                if (progress)
                    return progress;
            }
        }
    }
    catch (exc) {}

    try
    {
        if (request.loadGroup && request.loadGroup.groupObserver)
            return QI(request.loadGroup.groupObserver, nsIWebProgress);
    }
    catch (exc) {}
}

function getRequestCategory(request)
{
    try
    {
        if (request.notificationCallbacks)
        {
            if (request.notificationCallbacks instanceof XMLHttpRequest)
                return "xhr";
        }
    }
    catch (exc) {}
}

function getRequestElement(request)
{
    if (request instanceof imgIRequest)
    {
        if (request.decoderObserver && request.decoderObserver instanceof Element)
        {
            return request.decoderObserver;
        }
    }
}

function safeGetWindow(webProgress)
{
    try
    {
        if (webProgress)
            return webProgress.DOMWindow;
    }
    catch (exc) { }

    return null;
}

function safeGetName(request)
{
    try
    {
        return request.name;
    }
    catch (exc) { }

    return null;
}

function getFileCategory(file)
{
    if (file.category)
        return file.category;

    if (!file.mimeType)
    {
        var ext = getFileExtension(file.href);
        if (ext)
            file.mimeType = mimeExtensionMap[ext.toLowerCase()];
    }

    return (file.category = mimeCategoryMap[file.mimeType]);
}

function getMimeType(mimeType, uri)
{
    if (!mimeType || !(mimeCategoryMap.hasOwnProperty(mimeType)))
    {
        var ext = getFileExtension(uri);
        if (!ext)
            return mimeType;
        else
        {
            var extMimeType = mimeExtensionMap[ext.toLowerCase()];
            return extMimeType ? extMimeType : mimeType;
        }
    }
    else
        return mimeType;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

function now()
{
    return (new Date()).getTime();
}

function getFrameLevel(win)
{
    var level = 0;

    for (; win && (win != win.parent) && (win.parent instanceof Window); win = win.parent)
        ++level;

    return level;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

Firebug.NetMonitor.NetInfoBody = domplate(Firebug.Rep,
{
    tag:
        DIV({class: "netInfoBody", _repObject: "$file"},
            DIV({class: "netInfoTabs"},
                A({class: "netInfoParamsTab netInfoTab", onclick: "$onClickTab",
                    view: "Params",
                    $collapsed: "$file|hideParams"},
                    $STR("URLParameters")
                ),
                A({class: "netInfoHeadersTab netInfoTab", onclick: "$onClickTab",
                    view: "Headers"},
                    $STR("Headers")
                ),
                A({class: "netInfoPostTab netInfoTab", onclick: "$onClickTab",
                    view: "Post",
                    $collapsed: "$file|hidePost"},
                    $STR("Post")
                ),
                A({class: "netInfoPutTab netInfoTab", onclick: "$onClickTab",
                    view: "Put",
                    $collapsed: "$file|hidePut"},
                    $STR("Put")
                ),
                A({class: "netInfoResponseTab netInfoTab", onclick: "$onClickTab",
                    view: "Response",
                    $collapsed: "$file|hideResponse"},
                    $STR("Response")
                ),
                A({class: "netInfoCacheTab netInfoTab", onclick: "$onClickTab",
                   view: "Cache",
                   $collapsed: "$file|hideCache"},
                   "Cache" // todo: Localization
                )
            ),
            TABLE({class: "netInfoParamsText netInfoText netInfoParamsTable",
                    cellpadding: 0, cellspacing: 0}, TBODY()),
            TABLE({class: "netInfoHeadersText netInfoText netInfoHeadersTable",
                    cellpadding: 0, cellspacing: 0},
                TBODY(
                    TR({class: "netInfoResponseHeadersTitle"},
                        TD({colspan: 2},
                            DIV({class: "netInfoHeadersGroup"}, $STR("ResponseHeaders"))
                        )
                    ),
                    TR({class: "netInfoRequestHeadersTitle"},
                        TD({colspan: 2},
                            DIV({class: "netInfoHeadersGroup"}, $STR("RequestHeaders"))
                        )
                    )
                )
            ),
            DIV({class: "netInfoPostText netInfoText"},
                TABLE({class: "netInfoPostTable", cellpadding: 0, cellspacing: 0},
                    TBODY()
                )
            ),
            DIV({class: "netInfoPutText netInfoText"},
                TABLE({class: "netInfoPutTable", cellpadding: 0, cellspacing: 0},
                    TBODY()
                )
            ),
            DIV({class: "netInfoResponseText netInfoText"},
                $STR("Loading")
            ),
            DIV({class: "netInfoCacheText netInfoText"},
                TABLE({class: "netInfoCacheTable", cellpadding: 0, cellspacing: 0},
                    TBODY()
                )
            )
        ),

    headerDataTag:
        FOR("param", "$headers",
            TR(
                TD({class: "netInfoParamName"}, "$param.name"),
                TD({class: "netInfoParamValue"}, "$param.value")
            )
        ),

    hideParams: function(file)
    {
        return !file.urlParams || !file.urlParams.length;
    },

    hidePost: function(file)
    {
        return file.method.toUpperCase() != "POST";
    },

    hidePut: function(file)
    {
        return file.method.toUpperCase() != "PUT";
    },

    hideResponse: function(file)
    {
        return file.category in binaryFileCategories;
    },

    hideCache: function(file)
    {
        return !file.cacheEntry || file.category=="image";
    },

    onClickTab: function(event)
    {
        this.selectTab(event.currentTarget);
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    selectTabByName: function(netInfoBox, tabName)
    {
        var tab = getChildByClass(netInfoBox, "netInfoTabs", "netInfo"+tabName+"Tab");
        if (tab)
            this.selectTab(tab);
    },

    selectTab: function(tab)
    {
        var netInfoBox = tab.parentNode.parentNode;

        var view = tab.getAttribute("view");
        if (netInfoBox.selectedTab)
        {
            netInfoBox.selectedTab.removeAttribute("selected");
            netInfoBox.selectedText.removeAttribute("selected");
        }

        var textBodyName = "netInfo" + view + "Text";

        netInfoBox.selectedTab = tab;
        netInfoBox.selectedText = getChildByClass(netInfoBox, textBodyName);

        netInfoBox.selectedTab.setAttribute("selected", "true");
        netInfoBox.selectedText.setAttribute("selected", "true");

        var file = Firebug.getRepObject(netInfoBox);
        var context = Firebug.getElementPanel(netInfoBox).context;
        this.updateInfo(netInfoBox, file, context);
    },

    updateInfo: function(netInfoBox, file, context)
    {
        if (FBTrace.DBG_NET)                                     /*@explore*/
            FBTrace.dumpProperties("updateInfo file", file);     /*@explore*/

        var tab = netInfoBox.selectedTab;
        if (hasClass(tab, "netInfoParamsTab"))
        {
            if (file.urlParams && !netInfoBox.urlParamsPresented)
            {
                netInfoBox.urlParamsPresented = true;
                this.insertHeaderRows(netInfoBox, file.urlParams, "Params");
            }
        }

        if (hasClass(tab, "netInfoHeadersTab"))
        {
            if (file.responseHeaders && !netInfoBox.responseHeadersPresented)
            {
                netInfoBox.responseHeadersPresented = true;
                this.insertHeaderRows(netInfoBox, file.responseHeaders, "Headers", "ResponseHeaders");
            }

            if (file.requestHeaders && !netInfoBox.requestHeadersPresented)
            {
                netInfoBox.requestHeadersPresented = true;
                this.insertHeaderRows(netInfoBox, file.requestHeaders, "Headers", "RequestHeaders");
            }
        }

        if (hasClass(tab, "netInfoPostTab"))
        {
            var postTextBox = getChildByClass(netInfoBox, "netInfoPostText");
            if (!netInfoBox.postPresented)
            {
                netInfoBox.postPresented  = true;

                var text = getPostText(file, context);
                if (text != undefined)
                {
                    if (isURLEncodedFile(file, text))
                    {
                        var lines = text.split("\n");
                        var params = parseURLEncodedText(lines[lines.length-1]);
                        this.insertHeaderRows(netInfoBox, params, "Post");
                    }
                    else
                    {
                        var postText = formatPostText(text);
                        if (postText)
                            insertWrappedText(postText, postTextBox);
                    }
                }
            }
        }

        if (hasClass(tab, "netInfoPutTab"))
        {
            var putTextBox = getChildByClass(netInfoBox, "netInfoPutText");
            if (!netInfoBox.putPresented)
            {
                netInfoBox.putPresented  = true;

                var text = getPostText(file, context);
                if (text != undefined)
                {
                    if (isURLEncodedFile(file, text))
                    {
                        var lines = text.split("\n");
                        var params = parseURLEncodedText(lines[lines.length-1]);
                        this.insertHeaderRows(netInfoBox, params, "Put");
                    }
                    else
                    {
                        var putText = formatPostText(text);
                        if (putText)
                            insertWrappedText(putText, putTextBox);
                    }
                }
            }
        }


        if (hasClass(tab, "netInfoResponseTab") && file.loaded && !netInfoBox.responsePresented)
        {
            netInfoBox.responsePresented = true;

            var responseTextBox = getChildByClass(netInfoBox, "netInfoResponseText");
            if (file.category == "image")
            {
                var responseImage = netInfoBox.ownerDocument.createElement("img");
                responseImage.src = file.href;
                responseTextBox.replaceChild(responseImage, responseTextBox.firstChild);
            }
            else if (!(binaryCategoryMap.hasOwnProperty(file.category)))
            {
                var text = file.responseText
                    ? file.responseText
                    : context.sourceCache.loadText(file.href, file.method);

                if (text)
                    insertWrappedText(text, responseTextBox);
                else
                    insertWrappedText("", responseTextBox);
            }
        }

        if (hasClass(tab, "netInfoCacheTab") && file.loaded && !netInfoBox.cachePresented)
        {
            netInfoBox.cachePresented = true;

            var responseTextBox = getChildByClass(netInfoBox, "netInfoCacheText");
            if(file.cacheEntry) {
              this.insertHeaderRows(netInfoBox, file.cacheEntry, "Cache");
            }
        }
    },

    insertHeaderRows: function(netInfoBox, headers, tableName, rowName)
    {
        var headersTable = getElementByClass(netInfoBox, "netInfo"+tableName+"Table");
        var tbody = headersTable.firstChild;
        var titleRow = getChildByClass(tbody, "netInfo" + rowName + "Title");

        if (headers.length)
        {
            this.headerDataTag.insertRows({headers: headers}, titleRow ? titleRow : tbody);
            removeClass(titleRow, "collapsed");
        }
        else
            setClass(titleRow, "collapsed");
    }
});

// ************************************************************************************************

function findHeader(headers, name)
{
    for (var i = 0; i < headers.length; ++i)
    {
        if (headers[i].name == name)
            return headers[i].value;
    }
}

function formatPostText(text)
{
    if (text instanceof XMLDocument)
        return getElementXML(text.documentElement);
    else
        return text;
}

function getPostText(file, context)
{
    if (!file.postText)
        file.postText = readPostTextFromPage(file.href, context);

    if (!file.postText)
        file.postText = readPostTextFromRequest(file.request, context);

    return file.postText;
}

function readPostTextFromRequest(request, context)
{
    try
    {
        if (!request.notificationCallbacks)
            return null;

        var xhrRequest = GI(request.notificationCallbacks, nsIXMLHttpRequest);
        if (xhrRequest)
            return readPostTextFromXHR(xhrRequest, context);
    }
    catch(exc)
    {
        if (FBTrace.DBG_ERRORS)                                                         /*@explore*/
        {																			    /*@explore*/
            FBTrace.dumpProperties("lib.getPostText FAILS ", exc);                      /*@explore*/
        }																				/*@explore*/
    }

    return null;
}

function insertWrappedText(text, textBox)
{
    var reNonAlphaNumeric = /[^A-Za-z_$0-9'"-]/;

    var html = [];
    var wrapWidth = Firebug.textWrapWidth;

    var lines = splitLines(text);
    for (var i = 0; i < lines.length; ++i)
    {
        var line = lines[i];
        while (line.length > wrapWidth)
        {
            var m = reNonAlphaNumeric.exec(line.substr(wrapWidth, 100));
            var wrapIndex = wrapWidth+ (m ? m.index : 0);
            var subLine = line.substr(0, wrapIndex);
            line = line.substr(wrapIndex);

            html.push("<pre>");
            html.push(escapeHTML(subLine));
            html.push("</pre>");
        }

        html.push("<pre>");
        html.push(escapeHTML(line));
        html.push("</pre>");
    }

    textBox.innerHTML = html.join("");
}

function isURLEncodedFile(file, text)
{
    if (text && text.indexOf("Content-Type: application/x-www-form-urlencoded") != -1)
        return true;

    // The header value doesn't have to be alway exactly "application/x-www-form-urlencoded",
    // there can be even charset specified. So, use indexOf rather than just "==".
    var headerValue = findHeader(file.requestHeaders, "Content-Type");
    if (headerValue && headerValue.indexOf("application/x-www-form-urlencoded") == 0)
        return true;

    return false;
}

// ************************************************************************************************

// Helper HTTP observer
// This observer is used for observing the first document http-on-modify-request
// and http-on-examine-response events, which are fired before the context
// is initialized (initContext method call). Without this observer this events
// would be lost and the time measuring would be wrong.
//
// This observer stores these early requests in helper array (contexts) and maps
// them to appropriate tab - initContext then uses the array in order to access it.
//-----------------------------------------------------------------------------

var HttpObserver =
{
  // nsIObserver
  observe: function(aSubject, aTopic, aData)
  {
      try {
          aSubject = aSubject.QueryInterface(nsIHttpChannel);

          if (aTopic == 'http-on-modify-request') {
            this.onModifyRequest(aSubject);
          } else if (aTopic == 'http-on-examine-response') {
            this.onExamineResponse(aSubject);
          }
      }
      catch (err) 
      {
          if (FBTrace.DBG_ERRORS)
            ERROR(err)
      }
  },

  onModifyRequest: function(aRequest)
  {
      var tabId = getTabIdForHttpChannel(aRequest);
      var webProgress = getRequestWebProgress(aRequest, this);
      var win = webProgress ? safeGetWindow(webProgress) : null;

      if (FBTrace.DBG_NET)                                                                                             /*@explore*/
      {                                                                                                                /*@explore*/
          FBTrace.sysout("net.HttpObserver *** ON-MODIFY-REQUEST *** "+(tabId?"":"(No TAB)")+", request: ",                                       /*@explore*/
             safeGetName(aRequest));                                                                             /*@explore*/
      }                                                                                                                /*@explore*/

      if (!tabId || !win)                                                                                                      /*@explore*/
          return;                                                                                                      /*@explore*/

      this.onStartRequest(aRequest, now(), win, tabId);
  },

  onExamineResponse: function(aRequest)
  {
      var tabId = getTabIdForHttpChannel(aRequest);
      var webProgress = getRequestWebProgress(aRequest, this);
      var win = webProgress ? safeGetWindow(webProgress) : null;

      if (FBTrace.DBG_NET)                                                                                             /*@explore*/
      {                                                                                                                /*@explore*/
          FBTrace.sysout("net.HttpObserver *** ON-EXAMINE-RESPONSE *** "+(tabId?"":"(No TAB)")+", request: ",                                        /*@explore*/
            safeGetName(aRequest), aRequest);                                                                             /*@explore*/
      }                                                                                                                /*@explore*/
      if (win)
        this.onEndRequest(aRequest, now(), win, tabId);
  },

  onStartRequest: function(aRequest, aTime, aWin, aTabId)
  {
      var context = TabWatcher.getContextByWindow(aWin);
      if (!Firebug.NetMonitor.isEnabled(context))
        return;

      var name = aRequest.URI.asciiSpec;
      var origName = aRequest.originalURI.asciiSpec;
      var isRedirect = (name != origName);

      // We only need to create a new context if this is a top document uri (not frames).
      if ((aRequest.loadFlags & nsIChannel.LOAD_DOCUMENT_URI) &&
          aRequest.loadGroup &&
          aRequest.loadGroup.groupObserver &&
          aWin == aWin.parent &&
          !isRedirect && aTabId)
      {
          // Create a new network context prematurely.
          if (!contexts[aTabId])
              contexts[aTabId] = new NetProgress(null);
      }

      // Show only requests that are associated with a tab.  XXXjjb shouldn't this be up at beginning of method?
      if (!aTabId)
          return;

      var networkContext = contexts[aTabId];
      if (!networkContext)
          networkContext = context ? context.netProgress : null;

      if (networkContext) {
          var category = getRequestCategory(aRequest);
          networkContext.post(requestedFile, [aRequest, now(), aWin, category]);
      }
  },

  onEndRequest: function(aRequest, aTime, aWin, aTabId)
  {
      if (!aWin)
        return;

      var context = TabWatcher.getContextByWindow(aWin);
      if (!Firebug.NetMonitor.isEnabled(context))
        return;

      var name = aRequest.URI.asciiSpec;
      var origName = aRequest.originalURI.asciiSpec;
      var isRedirect = (name != origName);

      var networkContext = contexts[aTabId];
      if (!networkContext)
        networkContext = context ? context.netProgress : null;

      var info = new Object();
      info.responseStatus = aRequest.responseStatus;
      info.responseStatusText = aRequest.responseStatusText;
      info.postText = readPostTextFromRequest(aRequest, context);

      if (networkContext)
        networkContext.post(respondedFile, [aRequest, now(), info]);
  },

  QueryInterface: function(iid)
  {
      if (iid.equals(nsISupports) ||
          iid.equals(nsIObserver))
      {
          return this;
      }

      throw Components.results.NS_NOINTERFACE;
  }
}

// ************************************************************************************************

function getTabIdForHttpChannel(aHttpChannel)
{
    try {
        if (aHttpChannel.notificationCallbacks)
        {
            var interfaceRequestor = QI(aHttpChannel.notificationCallbacks, Ci.nsIInterfaceRequestor);

            try {
              var win = GI(interfaceRequestor, Ci.nsIDOMWindow);
              var tabId = Firebug.getTabIdForWindow(win);
              if (tabId)
                return tabId;
            }
            catch (err) {}
        }

        var progress = getRequestWebProgress(aHttpChannel);
        var win = safeGetWindow(progress);
        return Firebug.getTabIdForWindow(win);
    }
    catch (err) 
    {
        if (FBTrace.DBG_ERRORS)
            ERROR(err);
    }

    return null;
}

function GI(obj, iface)
{
    try
    {
        return obj.getInterface(iface);
    }
    catch (e)
    {
        if (e.name == "NS_NOINTERFACE")
        {
            if (FBTrace.DBG_NET)                                                         /*@explore*/
                FBTrace.sysout("net.getInterface - obj has no interface: ", iface, obj);  /*@explore*/
        }
    }

    return null;
};

// ************************************************************************************************

Firebug.registerActivableModule(Firebug.NetMonitor);
Firebug.registerPanel(NetPanel);

// ************************************************************************************************

}});



