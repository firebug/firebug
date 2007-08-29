/* See license.txt for terms of usage */
 
FBL.ns(function() { with (FBL) {
    
// ************************************************************************************************
// Constants

const nsIIOService = CI("nsIIOService");
const nsIRequest = CI("nsIRequest");
const nsICachingChannel = CI("nsICachingChannel");
const nsIScriptableInputStream = CI("nsIScriptableInputStream");
const nsIUploadChannel = CI("nsIUploadChannel");

const IOService = CC("@mozilla.org/network/io-service;1");
const ScriptableInputStream = CC("@mozilla.org/scriptableinputstream;1");

const LOAD_FROM_CACHE = nsIRequest.LOAD_FROM_CACHE;
const LOAD_BYPASS_LOCAL_CACHE_IF_BUSY = nsICachingChannel.LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;

const NS_BINDING_ABORTED = 0x804b0002;

// ************************************************************************************************

top.SourceCache = function(context)
{
    this.context = context;
    this.cache = {};
};

top.SourceCache.prototype =
{
    loadText: function(url)
    {
        var lines = this.load(url);
        return lines ? lines.join("\n") : null;
    },
    
    load: function(url)
    {
        if (url in this.cache)
            return this.cache[url];
        
        var charset = this.context.window.document.characterSet;
        
        var ioService = IOService.getService(nsIIOService);

        var channel;
        try
        {
            channel = ioService.newChannel(url, null, null);
            channel.loadFlags |= LOAD_FROM_CACHE | LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;
        }
        catch (exc)
        {
            return;
        }

        if (url == this.context.browser.contentWindow.location.href)
        {
            if (channel instanceof nsIUploadChannel)
            {
                var postData = getPostStream(this.context);
                var uploadChannel = QI(channel, nsIUploadChannel);
                uploadChannel.setUploadStream(postData, "", -1);
            }
            
            if (channel instanceof nsICachingChannel)
            {
                var cacheChannel = QI(channel, nsICachingChannel);
                cacheChannel.cacheKey = getCacheKey(this.context);
            }
        }
        
        var stream;
        try
        {
            stream = channel.open();
        }
        catch (exc)
        {
            return;
        }
        
        try
        {
            var data = readFromStream(stream, charset);
            var lines = data.split(/\r\n|\r|\n/);
            this.cache[url] = lines;
            
            return lines;
        }
        catch (exc)
        {
            stream.close();
        }
    },
    
    loadAsync: function(url, cb)
    {
        if (url in this.cache)
        {
            cb(this.cache[url], url);
            return;
        }

        var ioService = IOService.getService(nsIIOService);

        var channel = ioService.newChannel(url, null, null);
        channel.loadFlags |= LOAD_FROM_CACHE | LOAD_BYPASS_LOCAL_CACHE_IF_BUSY;

        var listener = new StreamListener(url, this, cb);
        channel.asyncOpen(listener, null);            
    }, 
    
    store: function(url, text)
    {
        var lines = splitLines(text);
        return this.cache[url] = lines;
    },
    
    invalidate: function(url)
    {
        delete this.cache[url];
    },
    
    getLine: function(url, lineNo)
    {
        var lines = this.load(url);
        return lines ? lines[lineNo-1] : null;
    },

    getLineAsync: function(url, lineNo, cb)
    {
        if (url in this.cache)
            cb(this.cache[url][lineNo-1], url, lineNo);
        else
        {
            function loader(lines, url)
            {      
                cb(lines[lineNo-1], url, lineNo);
            }

            this.loadAsync(url, loader);
        }
    }    
};

// ************************************************************************************************

function StreamListener(url, cache, cb)
{
    this.url = url;
    this.cache = cache;
    this.cb = cb;
    this.data = [];
}

StreamListener.prototype =
{
    onStartRequest: function(request, context)
    {
    },

    onStopRequest: function(request, context, status)
    {
        this.done = true;
        
        if (status != NS_BINDING_ABORTED)
        {
            var data = this.data.join("");
            var lines = this.cache.store(this.url, data);
            this.cb(lines, this.url, status);
        }
    },

    onDataAvailable: function(request, context, inStr, sourceOffset, count)
    {
        var sis = ScriptableInputStream.createInstance(nsIScriptableInputStream);
        sis.init(inStr);
        this.data.push(sis.read(count));
    }
};

// ************************************************************************************************

function getPostStream(context)
{
    try
    {
        var webNav = context.browser.webNavigation;
        var descriptor = QI(webNav, CI("nsIWebPageDescriptor")).currentDescriptor;
        var entry = QI(descriptor, CI("nsISHEntry"));
        
        // Seek to the beginning, or it will probably start reading at the end
        var postStream = QI(entry.postData, CI("nsISeekableStream"));
        postStream.seek(0, 0);
        
        return postStream;
     }
     catch (exc)
     {
     }
}

function getCacheKey(context)
{
    try
    {
        var webNav = context.browser.webNavigation;
        var descriptor = QI(webNav, CI("nsIWebPageDescriptor")).currentDescriptor;
        var entry = QI(descriptor, CI("nsISHEntry"));
        return entry.cacheKey;
     }
     catch (exc)
     {
     }
}

// ************************************************************************************************
    
}});
