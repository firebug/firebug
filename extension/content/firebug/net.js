/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const nsIWebProgressListener = CI("nsIWebProgressListener")
const nsIWebProgress = CI("nsIWebProgress")
const nsIRequest = CI("nsIRequest")
const nsIChannel = CI("nsIChannel")
const nsIHttpChannel = CI("nsIHttpChannel")
const nsICacheService = CI("nsICacheService")
const nsICache = CI("nsICache")
const nsIObserverService = CI("nsIObserverService")
const nsISupportsWeakReference = CI("nsISupportsWeakReference")
const nsISupports = CI("nsISupports")
const nsIIOService = CI("nsIIOService")
const imgIRequest = CI("imgIRequest");

const CacheService = CC("@mozilla.org/network/cache-service;1");
const ImgCache = CC("@mozilla.org/image/cache;1");
const IOService = CC("@mozilla.org/network/io-service;1");

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


const observerService = CCSV("@mozilla.org/observer-service;1", "nsIObserverService");

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

const maxPendingCheck = 200;
const maxQueueRequests = 50;

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

var cacheSession = null;

// ************************************************************************************************

Firebug.NetMonitor = extend(Firebug.Module,
{
    clear: function(context)
    {
        var panel = context.getPanel("net", true);
        if (panel)
            panel.clear();

        if (context.netProgress)
            context.netProgress.clear();
    },
    
    onToggleFilter: function(context, filterCategory)
    {
        Firebug.setPref("netFilterCategory", filterCategory);

        var panel = context.getPanel("net", true);
        if (panel)
        {
            panel.setFilter(filterCategory);
            panel.updateSummaries(now(), true);
        }
    },
    
    syncFilterButtons: function(chrome)
    {
        var button = chrome.$("fbNetFilter-"+Firebug.netFilterCategory);
        button.checked = true;    
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    // extends Module

    initialize: function()
    {
        this.syncFilterButtons(FirebugChrome);
    },

    initContext: function(context)
    {
        if (!Firebug.disableNetMonitor)
            monitorContext(context);
    },
    
    reattachContext: function(browser, context)
    {
        var chrome = context ? context.chrome : FirebugChrome;
        this.syncFilterButtons(chrome);
    },
    
    destroyContext: function(context)
    {
        if (context.netProgress)
            unmonitorContext(context);
    },
    
    showContext: function(browser, context)
    {
        /*if (context)
        {
            var panel = context.chrome.getSelectedPanel();
            if (panel && panel.name == "net")
                context.netProgress.panel = panel;
        }*/
    },
    
    loadedContext: function(context)
    {
        if (context.netProgress)
            context.netProgress.loaded = true;
    },
    
    showPanel: function(browser, panel)
    {
        var netButtons = browser.chrome.$("fbNetButtons");
        collapse(netButtons, !panel || panel.name != "net");

        if (panel && panel.context.netProgress)
        {
            if (panel.name == "net")
                panel.context.netProgress.activate(panel);
            else
                panel.context.netProgress.activate(null);
        }
    }    
});

// ************************************************************************************************

function NetPanel() {}

NetPanel.prototype = domplate(Firebug.Panel,
{   
    tableTag: 
        TABLE({class: "netTable", cellpadding: 0, cellspacing: 0, onclick: "$onClick"},
            TBODY(
                TR(
                    TD({width: "15%"}),
                    TD({width: "12%"}),
                    TD({width: "4%"}),
                    TD({width: "65%"})
                )
            )
        ),

    fileTag: 
        FOR("file", "$files",
            TR({class: "netRow $file.file|getCategory",
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
            TD({class: "netHeadCol", colspan: 4},
                DIV({class: "netHeadLabel"}, "$doc.rootFile.href")
            )
        ),

    netInfoTag:
        TR({class: "netInfoRow"},
            TD({class: "netInfoCol", colspan: 4})
        ),
    
    phaseTag:
        TR({class: "netRow netPhaseRow"},
            TD({class: "netPhaseCol", colspan: 4})
        ),
    
    summaryTag:
        TR({class: "netRow netSummaryRow"},
            TD({class: "netCol"},
                DIV({class: "netCountLabel netSummaryLabel"}, "-")
            ),
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
        return "category-"+getFileCategory(file);
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
        for (var file = phase.phaseLastStart; file; file = file.previousFile)
        {
            if (!category || file.category == category)
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
            
            if (file == phase)
                break;
        }
      
        var totalTime = maxTime - minTime;
        return {cachedSize: cachedSize, totalSize: totalSize, totalTime: totalTime,
                fileCount: fileCount}
    },

    getHref: function(file)
    {
        if (file.status && file.status != 200)
            return getFileName(file.href) + " (" + file.status + ")";
        else
            return getFileName(file.href);
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
            return bytes + " b";
        else if (bytes < 1000000)
            return Math.ceil(bytes/1000) + " KB";
        else
            return (Math.ceil(bytes/10000)/100) + " MB";
    },
    
    formatTime: function(elapsed)
    {
        if (elapsed == -1)
            return "_"; // should be &nbsp; but this will be escaped so we need something that is no whitespace
        else if (elapsed < 1000)
            return elapsed + "ms";
        else if (elapsed < 60000)
            return (Math.ceil(elapsed/10) / 100) + "s";
        else
            return (Math.ceil((elapsed/60000)*100)/100) + "m";
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
        this.panelNode.innerHTML = "";
        this.table = null;
        this.summaryRow = null;
        
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
            
            setClass(netInfo, "category-"+getFileCategory(row.repObject));
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
    
    name: "net",
    searchable: true,
    editable: false,
    
    initialize: function()
    {
        this.queue = [];

        Firebug.Panel.initialize.apply(this, arguments);
    },
    
    destroy: function(state)
    {
        if (this.pendingInterval)
        {
            this.context.clearInterval(this.pendingInterval);
            delete this.pendingInterval;
        }
        
        Firebug.Panel.destroy.apply(this, arguments);
    },
    
    show: function(state)
    {
        if (!this.filterCategory)
            this.setFilter(Firebug.netFilterCategory);
        
        this.layout();
        this.layoutInterval = setInterval(bindFixed(this.updateLayout, this), layoutInterval);

        if (this.wasScrolledToBottom)
            scrollToBottom(this.panelNode);
    },
    
    hide: function()
    {
        this.wasScrolledToBottom = isScrolledToBottom(this.panelNode);
        
        clearInterval(this.layoutInterval);
        delete this.layoutInterval;
    },
    
    updateOption: function(name, value)
    {
        if (name == "disableNetMonitor")
            TabWatcher.iterateContexts(value ? monitorContext : unmonitorContext);
        else if (name == "netFilterCategory")
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
        return [
            optionMenu("DisableNetMonitor", "disableNetMonitor")
        ];
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
        
        if (file.category in textFileCategories)
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
        if (!phase.invalidPhase)
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
        if (!this.queue.length || !this.context.netProgress)
            return;

        if (!this.table)
        {
            this.table = this.tableTag.replace({}, this.panelNode, this);
            this.summaryRow =  this.summaryTag.insertRows({}, this.table.lastChild.lastChild)[0];
        }
        
        var rightNow = now();        
        this.updateRowData(rightNow);
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

            phase = this.calculateFileTimes(file, phase, rightNow);
            this.updateFileRow(file, newFileData);

            file.invalid = false;
            this.invalidatePhase(file.phase);
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
        if (!row)
        {
            if (file.startTime)
            {
                newFileData.push({
                        file: file,
                        offset: this.barOffset + "%",
                        width: this.barWidth + "%",
                        elapsed: file.loaded ? this.elapsed : -1
                });
            }
        }
        else if (file.invalid)
        {
            var sizeLabel = row.childNodes[2].firstChild;
            sizeLabel.firstChild.nodeValue = this.getSize(file);

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

            var timeLabel = row.childNodes[3].firstChild.lastChild.firstChild;

            if (file.loaded)
            {
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
        var rootFile = this.context.netProgress.rootFile; // XXXjjb never read?
        var tbody = this.table.firstChild;

        // XXXjoe Don't update rows whose phase is done and layed out already
        var phase;
        for (var row = tbody.firstChild; row; row = row.nextSibling)
        {
            var file = row.repObject;
            if (!file)
                continue;

            phase = this.calculateFileTimes(file, phase, rightNow);

            var totalBar = row.childNodes[3].firstChild.childNodes[1];
            var timeBar = totalBar.nextSibling;

            totalBar.style.left = timeBar.style.left = this.barOffset + "%";
            timeBar.style.width = this.barWidth + "%";            

            if (file.phase.phaseLastEnd && !file.phase.summaryRow)
            {
                var previousPhase = this.summaryRow.phase;
                if (previousPhase)
                {
                    var lastRow = previousPhase.phaseLastStart.row;
                    previousPhase.summaryRow = this.phaseTag.insertRows({}, lastRow)[0];
                    this.invalidatePhase(previousPhase);
                }
                
                this.summaryRow.phase = file.phase;
                file.phase.summaryRow = this.summaryRow;
            }
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
        
        var sizeLabel = row.childNodes[2].firstChild;
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
            this.phaseEndTime = phase.phaseLastEndTime ? phase.phaseLastEndTime : rightNow;
            this.phaseElapsed = this.phaseEndTime - phase.startTime;
        }
        
        this.elapsed = file.loaded ? file.endTime - file.startTime : this.phaseEndTime - file.startTime;
        this.barWidth = Math.floor((this.elapsed/this.phaseElapsed) * 100);
        this.barOffset = Math.floor(((file.startTime-this.phaseStartTime)/this.phaseElapsed) * 100);

        return phase;
    }
});

// ************************************************************************************************

function NetProgress(context)
{    
    this.context = context;

    var queue = null;
    var panel = null;
    
    this.post = function(handler, args)
    {
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
            if (queue.length/2 >= maxQueueRequests)
                queue.splice(0, 2);
            queue.push(handler, args);
        }
                                                                                                                       /*@explore*/
        if (FBTrace.DBG_NET)                                                                                           /*@explore*/
            FBTrace.dumpProperties( " net.post.args "+(panel?" applied":"queued @"+(queue.length-2)), args);           /*@explore*/
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
    };
    
    this.activate = function(activePanel)
    {
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
        this.requestMap = {};
        this.files = [];
        this.phases = [];
        this.documents = [];
        this.windows = [];

        queue = [];
    };
    
    this.clear();
}

NetProgress.prototype =
{
    panel: null,
        
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
    
    respondedTopWindow: function(request, time, webProgress)
    {
        var win = webProgress ? safeGetWindow(webProgress) : null; 
        this.requestedFile(request, time, win);
        return this.respondedFile(request, time);
    },
    
    requestedFile: function(request, time, win, category) // XXXjjb 3rd arg was webProgress, pulled safeGetWindow up
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
            //file.loaded = true;
            if (category && !file.category)
                file.category = category;
            file.isBackground = request.loadFlags & LOAD_BACKGROUND;
            
            this.awaitFile(request, file);
            this.extendPhase(file);
 
            if (FBTrace.DBG_NET) FBTrace.dumpProperties("net.requestedFile file", file);                               /*@explore*/
            return file;
        }
        else                                                                                                           /*@explore*/
            if (FBTrace.DBG_NET) FBTrace.dumpProperties("net.requestedFile no file for request=", request);            /*@explore*/
    },
    
    respondedFile: function(request, time)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            var endedAlready = !!file.endTime;
            
            file.respondedTime = time;
            file.endTime = time;
            
            if (request.contentLength > 0)
                file.size = request.contentLength;
            
            if (request.responseStatus == 304)
                file.fromCache = true;
            else if (!file.fromCache)
                file.fromCache = false;

            getHttpHeaders(request, file);

            // This is a strange but effective tactic for simulating the
            // load of background images, which we can't actually track.
            // If endTime was set before this, that means the cache request
            // came back, which only seems to happen for background images.
            // We thus end the load now, since we know we'll never hear
            // from these requests again. 
            if (endedAlready)
                this.endLoad(file);
            
            return file;
        }
    },
    
    progressFile: function(request, progress, expectedSize)
    {
        var file = this.getRequestFile(request);
        if (file)
        {
            file.size = progress;
            file.expectedSize = expectedSize;
            
            this.arriveFile(file, request);

            return file;
        }
    },
    
    stopFile: function(request, time, postText, responseText)
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
            this.endLoad(file);

            getCacheEntry(file, this);
            
            return file;
        }
        else                                                                                                           /*@explore*/
            if (FBTrace.DBG_NET) FBTrace.dumpProperties("stopfile no file for request=", request);                     /*@explore*/
    },

    cacheEntryReady: function(request, file, size)
    {
        file.loaded = true;
        if (size != -1)
            file.size = size;
        
        getHttpHeaders(request, file);

        this.arriveFile(file, request);
        this.endLoad(file);
        
        return file;
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 

    getRequestFile: function(request, win)
    {
        var name = safeGetName(request);
        if (!name || reIgnore.exec(name))
            return null;

        var index = this.requests.indexOf(request);
        if (index == -1)
        {
            var file = this.requestMap[name];
            if (file)
                return file;

            if (!win || getRootWindow(win) != this.context.window)
                return;

            var fileDoc = this.getRequestDocument(win);
            var isDocument = request.loadFlags & LOAD_DOCUMENT_URI && fileDoc.parent;
            var doc = isDocument ? fileDoc.parent : fileDoc;

            file = doc.addFile(request);            
            if (isDocument)
            {
                fileDoc.documentFile = file;
                file.ownDocument = fileDoc;
            }

            if (!this.rootFile)
                this.rootFile = file;  // don't set file.previousFile
            else
                file.previousFile = this.files[this.files.length-1];

            file.request = request;
            file.index = this.files.length;
            this.requestMap[name] = file;
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
                var doc = new NetDocument(win);
                var doc = new NetDocument(win);  // XXXjjb arg ignored
                if (win.parent != win)
                    doc.parent = this.getRequestDocument(win.parent);

                doc.index = this.documents.length;
                doc.level = getFrameLevel(win);
                
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
        if (!this.pending)
            this.pending = [];
        
        // XXXjoe Remove files after they have been checked N times
        if (!this.pendingInterval)
        {
            this.pendingInterval = this.context.setInterval(bindFixed(function()
            {
                for (var i = 0; i < this.pending.length; ++i)
                {
                    var file = this.pending[i];
                    if (file.pendingCount > maxPendingCheck)
                    {
                        this.post(cacheEntryReady, [request, file, 0]);
                        this.pending.splice(i, 0);
                        --i;
                    }
                    else
                        waitForCacheCompletion(request, file, this);
                }
            }, this), 300);
        }
        
        file.pendingIndex = this.pending.length;
        this.pending.push(file);
    },

    arriveFile: function(file, request)
    {
        if (FBTrace.DBG_NET)                                                                                           /*@explore*/
            FBTrace.sysout("net.arriveFile for file.href="+file.href+" and request.name="+safeGetName(request)+"\n");  /*@explore*/
                                                                                                                       /*@explore*/
        delete this.requestMap[file.href];

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
        file.loaded = true;
        
        file.phase.phaseLastEnd = file;
        if (!file.phase.phaseLastEndTime || file.endTime > file.phase.phaseLastEndTime)
            file.phase.phaseLastEndTime = file.endTime;
    },
    
    extendPhase: function(file)
    {
        if (this.currentPhase)
        {
            var phaseLastStart = this.currentPhase.phaseLastStart;

            if (this.loaded && file.startTime - phaseLastStart.startTime >= phaseInterval)
                this.startPhase(file, phaseLastStart);
            else
                file.phase = this.currentPhase;
        }
        else
            this.startPhase(file, null);

        file.phase.phaseLastStart = file;
    },
    
    startPhase: function(file, phaseLastStart)
    {
        if (phaseLastStart)
            phaseLastStart.endPhase = true;
        
        file.phase = this.currentPhase = file;        
        file.startPhase = true;
        
        this.phases.push(file);
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
    // nsIObserver

    observe: function(request, topic, data)
    {
        request = QI(request, nsIHttpChannel);
        if (topic == "http-on-modify-request")
        {
            var webProgress = getRequestWebProgress(request, this);
            var category = getRequestCategory(request);
            var win = webProgress ? safeGetWindow(webProgress) : null;
            this.post(requestedFile, [request, now(), win, category]);
        }
        else
        {
            this.post(respondedFile, [request, now()]);
        }
    },
    
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // nsIWebProgressListener

    onStateChange: function(progress, request, flag, status)
    {
        if (flag & STATE_TRANSFERRING && flag & STATE_IS_DOCUMENT)
        {
            var win = progress.DOMWindow;
            if (win == win.parent)
                this.post(respondedTopWindow, [request, now(), progress]);
        }
        else if (flag & STATE_STOP && flag & STATE_IS_REQUEST)
        {
            if (this.getRequestFile(request))
                this.post(stopFile, [request, now()]);
        }
    },
    
    onProgressChange : function(progress, request, current, max, total, maxTotal)
    {
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

// ************************************************************************************************

function NetDocument()
{
    this.files = [];
}

NetDocument.prototype = 
{
    loaded: false,
    
    addFile: function(request)
    {
        var file = new NetFile(request.name, this);
        this.files.push(file);
        
        if (this.files.length == 1)
            this.rootFile = file;
        
        return file;
    }
};

// ************************************************************************************************

function NetFile(href, document)
{
    this.href = href;
    this.document = document
                                                                                                                       /*@explore*/
    if (FBTrace.DBG_NET) {                                                                                             /*@explore*/
        this.uid = FBL.getUniqueId();                                                                                  /*@explore*/
        FBTrace.dumpProperties("NetFile", this);                                                                       /*@explore*/
    }                                                                                                                  /*@explore*/
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
// Local Helpers

function monitorContext(context)
{
    if (!context.netProgress)
    {
        var listener = context.netProgress = new NetProgress(context);

        context.browser.addProgressListener(listener, NOTIFY_ALL);

        observerService.addObserver(listener, "http-on-modify-request", false);
        observerService.addObserver(listener, "http-on-examine-response", false);    
    }
}

function unmonitorContext(context)
{
    if (context.netProgress)
    {
        if (context.browser.docShell)
            context.browser.removeProgressListener(context.netProgress, NOTIFY_ALL);

        // XXXjoe We also want to do this when the context is hidden, so that 
        // background files are only logged in the currently visible context
        observerService.removeObserver(context.netProgress, "http-on-modify-request", false);
        observerService.removeObserver(context.netProgress, "http-on-examine-response", false);
        
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
                        netProgress.update(file);
                    }
                }
            });
        }
        catch (exc)
        {
            ERROR(exc);
        }        
    });
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
            file.mimeType = getMimeType(request);
        
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
                return request.notificationCallbacks.getInterface(nsIWebProgress);
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
        return webProgress.DOMWindow;
    }
    catch (exc)
    {
        return null;
    }
}

function safeGetName(request)
{
    try
    {
        return request.name;
    }
    catch (exc)
    {
        return null;
    }
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

function getMimeType(request)
{
    var mimeType = request.contentType;
    if (!mimeType || !(mimeType in mimeCategoryMap))
    {
        var ext = getFileExtension(request.name);
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
    
    for (; win && win != win.parent; win = win.parent)
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
        if (FBTrace.DBG_NET) FBTrace.dumpProperties("updateInfo file", file);                                          /*@explore*/
                                                                                                                       /*@explore*/
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
            else if (!(file.category in binaryCategoryMap))
            {
                var text = file.responseText
                    ? file.responseText
                    : context.sourceCache.loadText(file.href);
                
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
        file.postText = readPostText(file.href, context);

    return file.postText;
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
    return (text && text.indexOf("Content-Type: application/x-www-form-urlencoded") != -1)
        || findHeader(file.requestHeaders, "Content-Type") == "application/x-www-form-urlencoded";
}

// ************************************************************************************************

Firebug.registerModule(Firebug.NetMonitor);
Firebug.registerPanel(NetPanel);

// ************************************************************************************************

}});
    
