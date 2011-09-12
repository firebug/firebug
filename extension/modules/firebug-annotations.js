/* See license.txt for terms of usage */

// ********************************************************************************************* //
// Constants

var EXPORTED_SYMBOLS = ["annotationService"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

const dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

// ********************************************************************************************* //
// Annotation service implementation

Components.utils.import("resource://firebug/firebug-trace-service.js");
var FBTrace = traceConsoleService.getTracer("extensions.firebug");

/**
 * @class Represents an internal Firebug annotation service. This service is used to
 * annotate sites with an info whether Firebug should be activated for them or not.
 */
var annotationService =
{
    annotations: [],

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

    initialize: function()
    {
        // Get annotation file stored within the profile directory.
        this.file = dirService.get("ProfD", Ci.nsIFile);
        this.file.append("firebug");
        this.file.append("annotations.json");

        // Load annotations.
        this.loadAnnotations();
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Public Methods

    setPageAnnotation: function(uri, value)
    {
        if (FBTrace.DBG_ANNOTATIONS)
            FBTrace.sysout("AnnotationService.setPageAnnotation; " + value + ", " + uri.spec);

        this.annotations[uri.spec] = value;
    },

    getPageAnnotation: function(uri)
    {
        return this.annotations[uri.spec];
    },

    pageHasAnnotation: function(uri)
    {
        return this.annotations[uri.spec] ? true : false;
    },

    removePageAnnotation: function(uri)
    {
        if (FBTrace.DBG_ANNOTATIONS)
            FBTrace.sysout("AnnotationService.removePageAnnotation; " + uri.spec);

        delete this.annotations[uri.spec];
    },

    getAnnotations: function()
    {
        return this.annotations;
    },

    clear: function()
    {
        this.annotations = [];
    },

    flush: function()
    {
        try
        {
            // Initialize output stream.
            var outputStream = Cc["@mozilla.org/network/file-output-stream;1"]
                .createInstance(Ci.nsIFileOutputStream);
            outputStream.init(this.file, 0x02 | 0x08 | 0x20, 0666, 0); // write, create, truncate

            // Convert data to JSON.
            var arr = [];
            for (var uri in this.annotations)
                arr.push({
                    uri: uri,
                    value: this.annotations[uri]
                });

            var jsonString = JSON.stringify(arr);

            // Store annotations.
            outputStream.write(jsonString, jsonString.length);
            outputStream.close();

            if (FBTrace.DBG_ANNOTATIONS)
                FBTrace.sysout("AnnotationService.loadAnnotations; Annotations stored to " +
                    this.file.path, jsonString);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_ANNOTATIONS)
                FBTrace.sysout("AnnotationService.flush; EXCEPTION", err);
        }
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
    // Internals

    // Persistence
    loadAnnotations: function()
    {
        try
        {
            this.clear();

            if (!this.file.exists())
            {
                this.file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);
                if (FBTrace.DBG_ANNOTATIONS)
                    FBTrace.sysout("AnnotationService.loadAnnotations; Annotations file created " +
                        this.file.path);
                return;
            }

            var inputStream = Cc["@mozilla.org/network/file-input-stream;1"]
                .createInstance(Ci.nsIFileInputStream);
            var cstream = Cc["@mozilla.org/intl/converter-input-stream;1"]
                .createInstance(Ci.nsIConverterInputStream);

            // loadAnnotations input stream.
            inputStream.init(this.file, 0x01 | 0x08, 0666, 0); // read, create
            cstream.init(inputStream, "UTF-8", 0, 0);

            // Load annotations.
            var json = "";
            var data = {};
            while (cstream.readString(-1, data) != 0)
                json += data.value;

            if (!json.length)
                return;

            var arr = JSON.parse(json);
            if (!arr)
                return;

            // Convert to map for faster lookup.
            for (var i=0; i<arr.length; i++)
                this.annotations[arr[i].uri] = arr[i].value;

            if (FBTrace.DBG_ANNOTATIONS)
                FBTrace.sysout("AnnotationService.loadAnnotations; Annotations loaded from " +
                    this.file.path, arr);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_ANNOTATIONS)
                FBTrace.sysout("AnnotationService.loadAnnotations; EXCEPTION", err);
        }
    },
};

// ********************************************************************************************* //

annotationService.initialize();

// ********************************************************************************************* //
