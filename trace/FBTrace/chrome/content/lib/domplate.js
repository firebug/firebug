/* See license.txt for terms of usage */

define([
    "fbtrace/lib/string"
],
function(Str) {

// ********************************************************************************************* //

var Domplate = {};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

function DomplateTag(tagName)
{
    this.tagName = tagName;
}

Domplate.DomplateTag = DomplateTag;

function DomplateEmbed()
{
}

function DomplateLoop()
{
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

var womb = null;
var uid = 0;

// xxxHonza: the only global should be Firebug object.
var domplate = function()
{
    var lastSubject = null;
    for (var i = 0; i < arguments.length; ++i)
        lastSubject = lastSubject ? copyObject(lastSubject, arguments[i]) : arguments[i];

    for (var name in lastSubject)
    {
        var val = lastSubject[name];
        if (isTag(val))
        {
            if (val.tag.subject)
            {
                // Clone the entire domplate tag, e.g. DIV(), that is derived from
                // an existing template. This allows to hold correct 'subject'
                // reference that is used when executing callbacks implemented by
                // templates. Note that 'subject' points to the current template object.
                // See issue: http://code.google.com/p/fbug/issues/detail?id=4425
                lastSubject[name] = val = copyObject({}, val);
                val.tag = copyObject({}, val.tag);
            }
            val.tag.subject = lastSubject;
        }
    }

    return lastSubject;
};

domplate.context = function(context, fn)
{
    var lastContext = domplate.lastContext;
    domplate.topContext = context;
    fn.apply(context);
    domplate.topContext = lastContext;
};

// xxxHonza: the only global should be Firebug object.
Domplate.domplate = window.domplate = domplate;

Domplate.TAG = function()
{
    var embed = new DomplateEmbed();
    return embed.merge(arguments);
};

Domplate.FOR = function()
{
    var loop = new DomplateLoop();
    return loop.merge(arguments);
};

DomplateTag.prototype =
{
    /**
     * Initializer for DOM templates. Called to create new Functions objects like TR, TD,
     * OBJLINK, etc. See defineTag
     *
     * @param args keyword argments for the template, the {} brace stuff after the tag name,
     *      eg TR({...}, TD(...
     * @param oldTag a nested tag, eg the TD tag in TR({...}, TD(...
     */
    merge: function(args, oldTag)
    {
        if (oldTag)
            this.tagName = oldTag.tagName;

        this.context = oldTag ? oldTag.context : null;  // normally null on construction
        this.subject = oldTag ? oldTag.subject : null;
        this.attrs = oldTag ? copyObject(oldTag.attrs) : {};
        this.classes = oldTag ? copyObject(oldTag.classes) : {};
        this.props = oldTag ? copyObject(oldTag.props) : null;
        this.listeners = oldTag ? copyArray(oldTag.listeners) : null;
        this.children = oldTag ? copyArray(oldTag.children) : [];
        this.vars = oldTag ? copyArray(oldTag.vars) : [];

        var attrs = args.length ? args[0] : null;
        var hasAttrs = typeof(attrs) == "object" && !isTag(attrs);

        // Do not clear children, they can be copied from the oldTag.
        //this.children = [];

        if (domplate.topContext)
            this.context = domplate.topContext;

        if (args.length)
            parseChildren(args, hasAttrs ? 1 : 0, this.vars, this.children);

        if (hasAttrs)
            this.parseAttrs(attrs);

        return creator(this, DomplateTag);
    },

    parseAttrs: function(args)
    {
        for (var name in args)
        {
            var val = parseValue(args[name]);
            readPartNames(val, this.vars);

            if (name.lastIndexOf("on", 0) == 0)
            {
                var eventName = name.substr(2);
                if (!this.listeners)
                    this.listeners = [];
                this.listeners.push(eventName, val);
            }
            else if (name[0] == "_")
            {
                var propName = name.substr(1);
                if (!this.props)
                    this.props = {};
                this.props[propName] = val;
            }
            else if (name[0] == "$")
            {
                var className = name.substr(1);
                if (!this.classes)
                    this.classes = {};
                this.classes[className] = val;
            }
            else
            {
                if (name == "class" && this.attrs.hasOwnProperty(name))
                    this.attrs[name] += " " + val;
                else
                    this.attrs[name] = val;
            }
        }
    },

    compile: function()
    {
        if (this.renderMarkup)
            return;

        this.compileMarkup();
        this.compileDOM();
    },

    compileMarkup: function()
    {
        this.markupArgs = [];
        var topBlock = [], topOuts = [], blocks = [], info = {args: this.markupArgs, argIndex: 0};

        this.generateMarkup(topBlock, topOuts, blocks, info);
        this.addCode(topBlock, topOuts, blocks);

        var fnBlock = ['(function (__code__, __context__, __in__, __out__'];
        for (var i = 0; i < info.argIndex; ++i)
            fnBlock.push(', s', i);
        fnBlock.push(') {\n');

        if (this.subject)
            fnBlock.push('with (this) {\n');
        if (this.context)
            fnBlock.push('with (__context__) {\n');
        fnBlock.push('with (__in__) {\n');

        fnBlock.push.apply(fnBlock, blocks);

        if (this.subject)
            fnBlock.push('}\n');
        if (this.context)
            fnBlock.push('}\n');

        fnBlock.push('}})\n');

        function __link__(tag, code, outputs, args)
        {
            if (!tag || !tag.tag)
            {
                if (FBTrace.DBG_DOMPLATE)
                {
                    FBTrace.sysout("domplate.Empty tag object passed to __link__ " +
                        "(compileMarkup). Ignoring element.");
                }
                return;
            }

            tag.tag.compile();

            var tagOutputs = [];
            var markupArgs = [code, tag.tag.context, args, tagOutputs];
            markupArgs.push.apply(markupArgs, tag.tag.markupArgs);
            tag.tag.renderMarkup.apply(tag.tag.subject, markupArgs);

            outputs.push(tag);
            outputs.push(tagOutputs);
        }

        function __escape__(value)
        {
            return Str.escapeForElementAttribute(value);
        }

        function __attr__(name, valueParts)
        {
            // Will be called with valueParts = [,arg,arg,...], but we don't
            // care that the first element is undefined.
            if (valueParts.length === 2 && valueParts[1] === undefined)
                return "";
            var value = valueParts.join("");
            return ' ' + name + '="' + __escape__(value) + '"';
        }

        function isArray(it)
        {
            return Object.prototype.toString.call(it) === "[object Array]";
        }

        function __loop__(iter, outputs, fn)
        {
            var iterOuts = [];
            outputs.push(iterOuts);

            if (!iter)
                return;

            if (isArray(iter) || iter instanceof NodeList)
                iter = new ArrayIterator(iter);

            var value = null;
            try
            {
                while (1)
                {
                    value = iter.next();
                    var itemOuts = [0,0];
                    iterOuts.push(itemOuts);
                    fn.apply(this, [value, itemOuts]);
                }
            }
            catch (exc)
            {
                if (exc != StopIteration && FBTrace.DBG_ERRORS)
                    FBTrace.sysout("domplate; __loop__ EXCEPTION " +
                        (value ? value.name : "no value") + ", " + exc, exc);

                // Don't throw the exception, many built in objects in Firefox throws exceptions
                // these days and it breaks the UI. We can remove as soon as:
                // 389002 and 455013 are fixed.
                //if (exc != StopIteration)
                //    throw exc;
            }
        }

        if (FBTrace.DBG_DOMPLATE)
        {
            fnBlock.push("//@ sourceURL=chrome://firebug/compileMarkup_" +
                (this.tagName?this.tagName:'')+"_"+(uid++)+".js\n");
        }

        var js = fnBlock.join("");
        this.renderMarkup = eval(js);
    },

    getVarNames: function(args)
    {
        if (this.vars)
            args.push.apply(args, this.vars);

        for (var i = 0; i < this.children.length; ++i)
        {
            var child = this.children[i];
            if (isTag(child))
                child.tag.getVarNames(args);
            else if (child instanceof Parts)
            {
                for (var i = 0; i < child.parts.length; ++i)
                {
                    if (child.parts[i] instanceof Variables)
                    {
                        var name = child.parts[i].names[0];
                        var names = name.split(".");
                        args.push(names[0]);
                    }
                }
            }
        }
    },

    generateMarkup: function(topBlock, topOuts, blocks, info)
    {
        if (FBTrace.DBG_DOMPLATE)
            var beginBlock = topBlock.length;

        topBlock.push(',"<', this.tagName, '"');

        for (var name in this.attrs)
        {
            if (name != "class")
            {
                var val = this.attrs[name];
                topBlock.push(',__attr__("', name, '",[');
                addParts(val, ',', topBlock, info, false);
                topBlock.push('])');
            }
        }
        if (this.listeners)
        {
            for (var i = 0; i < this.listeners.length; i += 2)
                readPartNames(this.listeners[i+1], topOuts);
        }

        if (this.props)
        {
            for (var name in this.props)
                readPartNames(this.props[name], topOuts);
        }

        if (this.attrs.hasOwnProperty("class") || this.classes)
        {
            topBlock.push(', " class=\\""');
            if (this.attrs.hasOwnProperty("class"))
                addParts(this.attrs["class"], ',', topBlock, info, true);
            topBlock.push(', " "');
            for (var name in this.classes)
            {
                topBlock.push(', (');
                addParts(this.classes[name], '', topBlock, info);
                topBlock.push(' ? "', name, '" + " " : "")');
            }
            topBlock.push(', "\\""');
        }
        topBlock.push(',">"');

        this.generateChildMarkup(topBlock, topOuts, blocks, info);

        // <br> element doesn't use end tag.
        if (this.tagName != "br")
            topBlock.push(',"</', this.tagName, '>"');

        if (FBTrace.DBG_DOMPLATE)
            FBTrace.sysout("DomplateTag.generateMarkup " + this.tagName + ": " +
                topBlock.slice( - topBlock.length + beginBlock).join("").replace("\n"," "),
                {listeners: this.listeners, props: this.props, attrs: this.attrs});

    },

    generateChildMarkup: function(topBlock, topOuts, blocks, info)
    {
        for (var i = 0; i < this.children.length; ++i)
        {
            var child = this.children[i];
            if (isTag(child))
                child.tag.generateMarkup(topBlock, topOuts, blocks, info);
            else
                addParts(child, ',', topBlock, info, true);
        }
    },

    addCode: function(topBlock, topOuts, blocks)
    {
        if (topBlock.length)
        {
            blocks.push('__code__.push(""', topBlock.join(""), ');\n');
            if (FBTrace.DBG_DOMPLATE)
                blocks.push('FBTrace.sysout("addCode "+__code__.join(""));\n');
        }

        if (topOuts.length)
            blocks.push('__out__.push(', topOuts.join(","), ');\n');
        topBlock.splice(0, topBlock.length);
        topOuts.splice(0, topOuts.length);
    },

    addLocals: function(blocks)
    {
        var varNames = [];
        this.getVarNames(varNames);

        var map = {};
        for (var i = 0; i < varNames.length; ++i)
        {
            var name = varNames[i];
            if ( map.hasOwnProperty(name) )
                continue;

            map[name] = 1;
            var names = name.split(".");
            blocks.push('var ', names[0] + ' = ' + '__in__.' + names[0] + ';\n');
        }
    },

    compileDOM: function()
    {
        var path = [];
        var blocks = [];
        this.domArgs = [];
        path.embedIndex = 0;
        path.loopIndex = 0;
        path.staticIndex = 0;
        path.renderIndex = 0;
        var nodeCount = this.generateDOM(path, blocks, this.domArgs);

        var fnBlock = ['(function (root, context, o'];
        for (var i = 0; i < path.staticIndex; ++i)
            fnBlock.push(', ', 's'+i);
        for (var i = 0; i < path.renderIndex; ++i)
            fnBlock.push(', ', 'd'+i);

        fnBlock.push(') {\n');
        for (var i = 0; i < path.loopIndex; ++i)
            fnBlock.push('var l', i, ' = 0;\n');
        for (var i = 0; i < path.embedIndex; ++i)
            fnBlock.push('var e', i, ' = 0;\n');

        if (this.subject)
            fnBlock.push('with (this) {\n');
        if (this.context)
            fnBlock.push('with (context) {\n');

        fnBlock.push(blocks.join(""));

        if (this.context)
            fnBlock.push('}\n');
        if (this.subject)
            fnBlock.push('}\n');

        fnBlock.push('return ', nodeCount, ';\n');
        fnBlock.push('})\n');

        function __bind__(object, fn)
        {
            return function(event) { return fn.apply(object, [event]); };
        }

        function __link__(node, tag, args)
        {
            if (!tag || !tag.tag)
            {
                if (FBTrace.DBG_DOMPLATE)
                {
                    FBTrace.sysout("domplate.Empty tag object passed to __link__ " +
                        "(compileDOM). Ignoring element.");
                }
                return;
            }

            tag.tag.compile();

            var domArgs = [node, tag.tag.context, 0];
            domArgs.push.apply(domArgs, tag.tag.domArgs);
            domArgs.push.apply(domArgs, args);

            return tag.tag.renderDOM.apply(tag.tag.subject, domArgs);
        }

        function __loop__(iter, fn)
        {
            if (!iter)
                return 0;

            var nodeCount = 0;
            for (var i = 0; i < iter.length; ++i)
            {
                iter[i][0] = i;
                iter[i][1] = nodeCount;
                nodeCount += fn.apply(this, iter[i]);
            }
            return nodeCount;
        }

        // start at a given node |parent|, then index recursively into its children using
        // arguments 2, 3, ... The primary purpose of the 'path' is to name variables in the
        // generated code
        function __path__(parent, offset)
        {
            var root = parent;

            for (var i = 2; i < arguments.length; ++i)
            {
                var index = arguments[i];

                if (i == 3)
                    index += offset;

                if (index == -1)  // then walk up the tree
                    parent = parent.parentNode;
                else
                    parent = parent.childNodes[index];

                if (FBTrace.DBG_DOMPLATE && !parent)
                    FBTrace.sysout("domplate.__path__ will return null for root "+root+
                        " and offset "+offset+" arguments["+i+"]="+arguments[i]+' index: '+
                        index, {root: root});
            }

            return parent;
        }

        if (FBTrace.DBG_DOMPLATE)
            fnBlock.push("//@ sourceURL=chrome://firebug/compileDOM_"+
                (this.tagName?this.tagName:'')+"_"+(uid++)+".js\n");

        var js = fnBlock.join("");
        // Exceptions on this line are often in the eval
        try
        {
            this.renderDOM = eval(js);
        }
        catch(exc)
        {
            if (FBTrace.DBG_DOMPLATE)
                FBTrace.sysout("renderDOM FAILS "+exc, {exc:exc, js: js});
            var chained =  new Error("Domplate.renderDom FAILS");
            chained.cause = {exc:exc, js: js};
            throw chained;
        }
    },

    generateDOM: function(path, blocks, args)
    {
        if (this.listeners || this.props)
            this.generateNodePath(path, blocks);

        if (this.listeners)
        {
            for (var i = 0; i < this.listeners.length; i += 2)
            {
                var val = this.listeners[i+1];
                var arg = generateArg(val, path, args);

                blocks.push('node.addEventListener("', this.listeners[i],
                    '", __bind__(this, ', arg, '), false);\n');
            }
        }

        if (this.props)
        {
            for (var name in this.props)
            {
                var val = this.props[name];
                var arg = generateArg(val, path, args);
                blocks.push('node.', name, ' = ', arg, ';\n');
            }
        }

        this.generateChildDOM(path, blocks, args);
        return 1;
    },

    generateNodePath: function(path, blocks)
    {
        blocks.push("var node = __path__(root, o");

        // this will be a sum of integers as a string which will be summed in the eval,
        // then passed to __path__
        for (var i = 0; i < path.length; ++i)
            blocks.push(",", path[i]);

        blocks.push(");\n");

        if (FBTrace.DBG_DOMPLATE)
        {
            var nBlocks = 2*path.length + 2;
            var genTrace = "FBTrace.sysout(\'"+blocks.slice(-nBlocks).join("").replace("\n","")+
                "\'+'->'+(node?FBL.getElementHTML(node):'null'), node);\n";
            blocks.push(genTrace);
        }
    },

    generateChildDOM: function(path, blocks, args)
    {
        path.push(0);
        for (var i = 0; i < this.children.length; ++i)
        {
            var child = this.children[i];
            if (isTag(child))
                path[path.length-1] += '+' + child.tag.generateDOM(path, blocks, args);
            else
                path[path.length-1] += '+1';
        }
        path.pop();
    },

    /**
     * We are just hiding from javascript.options.strict. For some reasons it's ok if
     * we return undefined here.
     *
     * @return null or undefined or possibly a context.
     */
    getContext: function()
    {
        return this.context;
    }
};

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

DomplateEmbed.prototype = copyObject(DomplateTag.prototype,
{
    merge: function(args, oldTag)
    {
        this.value = oldTag ? oldTag.value : parseValue(args[0]);
        this.attrs = oldTag ? oldTag.attrs : {};
        this.vars = oldTag ? copyArray(oldTag.vars) : [];

        var attrs = args[1];
        for (var name in attrs)
        {
            var val = parseValue(attrs[name]);
            this.attrs[name] = val;
            readPartNames(val, this.vars);
        }

        return creator(this, DomplateEmbed);
    },

    getVarNames: function(names)
    {
        if (this.value instanceof Parts)
            names.push(this.value.parts[0].name);

        if (this.vars)
            names.push.apply(names, this.vars);
    },

    generateMarkup: function(topBlock, topOuts, blocks, info)
    {
        this.addCode(topBlock, topOuts, blocks);

        if (FBTrace.DBG_DOMPLATE)
            var beginBlock = blocks.length;

        blocks.push('__link__(');
        addParts(this.value, '', blocks, info);
        blocks.push(', __code__, __out__, {\n');

        var lastName = null;
        for (var name in this.attrs)
        {
            if (lastName)
                blocks.push(',');
            lastName = name;

            var val = this.attrs[name];
            blocks.push('"', name, '":');
            addParts(val, '', blocks, info);
        }

        blocks.push('});\n');

        if (FBTrace.DBG_DOMPLATE)
        {
            FBTrace.sysout("DomplateEmbed.generateMarkup "+blocks.slice( - blocks.length +
                beginBlock).join("").replace("\n"," "), {value: this.value, attrs: this.attrs});
        }

        //this.generateChildMarkup(topBlock, topOuts, blocks, info);
    },

    generateDOM: function(path, blocks, args)  // XXXjjb args not used?
    {
        if (FBTrace.DBG_DOMPLATE)
            var beginBlock = blocks.length;

        var embedName = 'e'+path.embedIndex++;

        this.generateNodePath(path, blocks);

        var valueName = 'd' + path.renderIndex++;
        var argsName = 'd' + path.renderIndex++;
        blocks.push(embedName + ' = __link__(node, ', valueName, ', ', argsName, ');\n');

        if (FBTrace.DBG_DOMPLATE)
        {
            FBTrace.sysout("DomplateEmbed.generateDOM "+blocks.slice( - blocks.length +
                beginBlock).join("").replace("\n"," "), {path: path});

            blocks.push("FBTrace.sysout('__link__ called with node:'+" +
                "FBL.getElementHTML(node), node);\n");
        }

        return embedName;
    }
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

DomplateLoop.prototype = copyObject(DomplateTag.prototype,
{
    merge: function(args, oldTag)
    {
        this.isLoop = true;
        this.varName = oldTag ? oldTag.varName : args[0];
        this.iter = oldTag ? oldTag.iter : parseValue(args[1]);
        this.vars = [];

        this.children = oldTag ? copyArray(oldTag.children) : [];

        var offset = Math.min(args.length, 2);
        parseChildren(args, offset, this.vars, this.children);

        return creator(this, DomplateLoop);
    },

    getVarNames: function(names)
    {
        if (this.iter instanceof Parts)
            names.push(this.iter.parts[0].name);

        DomplateTag.prototype.getVarNames.apply(this, [names]);
    },

    generateMarkup: function(topBlock, topOuts, blocks, info)
    {
        this.addCode(topBlock, topOuts, blocks);

        // We are in a FOR loop and our this.iter property contains
        // either a simple function name as a string or a Parts object
        // with only ONE Variables object. There is only one variables object
        // as the FOR argument can contain only ONE valid function callback
        // with optional arguments or just one variable. Allowed arguments are
        // func or $var or $var.sub or $var|func or $var1,$var2|func or $var|func1|func2 or $var1,$var2|func1|func2
        var iterName;
        if (this.iter instanceof Parts)
        {
            // We have a function with optional aruments or just one variable
            var part = this.iter.parts[0];
            
            // Join our function arguments or variables
            // If the user has supplied multiple variables without a function
            // this will create an invalid result and we should probably add an
            // error message here or just take the first variable
            iterName = part.names.join(",");

            // Nest our functions
            if (part.format)
            {
                for (var i = 0; i < part.format.length; ++i)
                    iterName = part.format[i] + "(" + iterName + ")";
            }
        }
        else
        {
            // We have just a simple function name without any arguments
            iterName = this.iter;
        }

        blocks.push('__loop__.apply(this, [', iterName, ', __out__, function(',
            this.varName, ', __out__) {\n');
        this.generateChildMarkup(topBlock, topOuts, blocks, info);
        this.addCode(topBlock, topOuts, blocks);

        blocks.push('}]);\n');
    },

    generateDOM: function(path, blocks, args)
    {
        var iterName = 'd'+path.renderIndex++;
        var counterName = 'i'+path.loopIndex;
        var loopName = 'l'+path.loopIndex++;

        if (!path.length)
            path.push(-1, 0);

        var preIndex = path.renderIndex;
        path.renderIndex = 0;

        var nodeCount = 0;

        var subBlocks = [];
        var basePath = path[path.length-1];
        for (var i = 0; i < this.children.length; ++i)
        {
            path[path.length-1] = basePath+'+'+loopName+'+'+nodeCount;

            var child = this.children[i];
            if (isTag(child))
                nodeCount += '+' + child.tag.generateDOM(path, subBlocks, args);
            else
                nodeCount += '+1';
        }

        path[path.length-1] = basePath+'+'+loopName;

        blocks.push(loopName,' = __loop__.apply(this, [', iterName, ', function(',
            counterName,',',loopName);

        for (var i = 0; i < path.renderIndex; ++i)
            blocks.push(',d'+i);

        blocks.push(') {\n');
        blocks.push(subBlocks.join(""));
        blocks.push('return ', nodeCount, ';\n');
        blocks.push('}]);\n');

        path.renderIndex = preIndex;

        return loopName;
    }
});

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

function Variables(names, format)
{
    this.names = names;
    this.format = format;
}

function Parts(parts)
{
    this.parts = parts;
}

// ********************************************************************************************* //

function parseParts(str)
{
    // Match $var or $var.sub or $var|func or $var1,$var2|func or $var|func1|func2 or $var1,$var2|func1|func2
    var re = /\$([_A-Za-z][_A-Za-z0-9.]*(,\$[_A-Za-z][_A-Za-z0-9.]*)*([_A-Za-z0-9.|]*))/g;
    var index = 0;
    var parts = [];

    var m;
    while (m = re.exec(str))
    {
        var pre = str.substr(index, (re.lastIndex-m[0].length)-index);
        if (pre)
            parts.push(pre);

        var segs = m[1].split("|");
        var vars = segs[0].split(",$");

        // Assemble the variables object and append to buffer
        parts.push(new Variables(vars, segs.slice(1)));

        index = re.lastIndex;
    }

    // No matches found at all so we return the whole string
    if (!index)
        return str;

    // If we have data after our last matched index we append it here as the final step
    var post = str.substr(index);
    if (post)
        parts.push(post);

    return new Parts(parts);
}

function parseValue(val)
{
    return typeof(val) == 'string' ? parseParts(val) : val;
}

function parseChildren(args, offset, vars, children)
{
    for (var i = offset; i < args.length; ++i)
    {
        var val = parseValue(args[i]);
        children.push(val);
        readPartNames(val, vars);
    }
}

function readPartNames(val, vars)
{
    if (val instanceof Parts)
    {
        for (var i = 0; i < val.parts.length; ++i)
        {
            var part = val.parts[i];
            if (part instanceof Variables)
                vars.push(part.names[0]);
        }
    }
}

function generateArg(val, path, args)
{
    if (val instanceof Parts)
    {
        var vals = [];
        for (var i = 0; i < val.parts.length; ++i)
        {
            var part = val.parts[i];
            if (part instanceof Variables)
            {
                var varName = 'd'+path.renderIndex++;
                if (part.format)
                {
                    for (var j = 0; j < part.format.length; ++j)
                        varName = part.format[j] + '(' + varName + ')';
                }

                vals.push(varName);
            }
            else
                vals.push('"'+part.replace(/"/g, '\\"')+'"');
        }

        return vals.join('+');
    }
    else
    {
        args.push(val);
        return 's' + path.staticIndex++;
    }
}

function addParts(val, delim, block, info, escapeIt)
{
    var vals = [];
    if (val instanceof Parts)
    {
        for (var i = 0; i < val.parts.length; ++i)
        {
            var part = val.parts[i];
            if (part instanceof Variables)
            {
                var partName = part.names.join(",");
                if (part.format)
                {
                    for (var j = 0; j < part.format.length; ++j)
                        partName = part.format[j] + "(" + partName + ")";
                }

                if (escapeIt)
                    vals.push("__escape__(" + partName + ")");
                else
                    vals.push(partName);
            }
            else
                vals.push('"'+ part + '"');
        }
    }
    else if (isTag(val))
    {
        info.args.push(val);
        vals.push('s'+info.argIndex++);
    }
    else
        vals.push('"'+ val + '"');

    var parts = vals.join(delim);
    if (parts)
        block.push(delim, parts);
}

function isTag(obj)
{
    return (typeof(obj) == "function" || obj instanceof Function) && !!obj.tag;
}

function creator(tag, cons)
{
    var fn = function()
    {
        var tag = fn.tag;
        var cons = fn.cons;
        var newTag = new cons();
        return newTag.merge(arguments, tag);
    };

    fn.tag = tag;
    fn.cons = cons;
    extend(fn, Renderer);

    return fn;
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

function copyArray(oldArray)
{
    var ary = [];
    if (oldArray)
        for (var i = 0; i < oldArray.length; ++i)
            ary.push(oldArray[i]);
   return ary;
}

function copyObject(l, r)
{
    var m = {};
    extend(m, l);
    extend(m, r);
    return m;
}

function extend(l, r)
{
    for (var n in r)
        l[n] = r[n];
}

// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

function ArrayIterator(array)
{
    var index = -1;

    this.next = function()
    {
        if (++index >= array.length)
            throw StopIteration;

        return array[index];
    };
}

function StopIteration() {}

var $break = function()
{
    throw StopIteration;
};

// ********************************************************************************************* //

var Renderer =
{
    renderHTML: function(args, outputs, self)
    {
        try
        {
            var code = [];
            var markupArgs = [code, this.tag.getContext(), args, outputs];
            markupArgs.push.apply(markupArgs, this.tag.markupArgs);
            this.tag.renderMarkup.apply(self ? self : this.tag.subject, markupArgs);
            return code.join("");
        }
        catch (e)
        {
            if (FBTrace.DBG_DOMPLATE || FBTrace.DBG_ERRORS)
                FBTrace.sysout("domplate.renderHTML; EXCEPTION " + e,
                    {exc: e, render: this.tag.renderMarkup.toSource()});
        }
    },

    insertRows: function(args, before, self)
    {
        if (!args)
            args = {};

        this.tag.compile();

        var outputs = [];
        var html = this.renderHTML(args, outputs, self);

        var doc = before.ownerDocument;
        var table = doc.createElement("table");
        table.innerHTML = html;

        var tbody = table.firstChild;
        var parent = before.localName.toLowerCase() == "tr" ? before.parentNode : before;
        var after = before.localName.toLowerCase() == "tr" ? before.nextSibling : null;

        var firstRow = tbody.firstChild;
        var lastRow = null;
        while (tbody.firstChild)
        {
            lastRow = tbody.firstChild;
            if (after)
                parent.insertBefore(lastRow, after);
            else
                parent.appendChild(lastRow);
        }

        // To save the next poor soul:
        // In order to properly apply properties and event handlers on elements
        // constructed by a FOR tag, the tag needs to be able to iterate up and
        // down the tree. If FOR is the root element, as is the case with
        // many 'insertRows' calls, it will need to iterator over portions of the
        // new parent.
        //
        // To achieve this end, __path__ defines the -1 operator which allows
        // parent traversal. When combined with the offset that we calculate
        // below we are able to iterate over the elements.
        //
        // This fails when applied to a non-loop element as non-loop elements
        // do not generate to proper path to bounce up and down the tree.
        //
        var offset = 0;
        if (this.tag.isLoop)
        {
            var node = firstRow.parentNode.firstChild;
            for (; node && node != firstRow; node = node.nextSibling)
                ++offset;
        }

        // strict warning: this.tag.context undefined
        var domArgs = [firstRow, this.tag.getContext(), offset];
        domArgs.push.apply(domArgs, this.tag.domArgs);
        domArgs.push.apply(domArgs, outputs);

        this.tag.renderDOM.apply(self ? self : this.tag.subject, domArgs);
        return [firstRow, lastRow];
    },

    insertBefore: function(args, before, self)
    {
        return this.insertNode(
                args, before.ownerDocument,
                function beforeInserter(frag) {
                    before.parentNode.insertBefore(frag, before);
                },
                self);
    },

    insertAfter: function(args, after, self)
    {
        return this.insertNode(
                args, after.ownerDocument,
                function(frag) {
                    after.parentNode.insertBefore(frag, after.nextSibling);
                },
                self);
    },

    insertNode: function(args, doc, inserter, self)
    {
        if (!args)
            args = {};

        this.tag.compile();

        var outputs = [];
        var html = this.renderHTML(args, outputs, self);
        if (FBTrace.DBG_DOMPLATE)
            FBTrace.sysout("domplate.insertNode html: "+html+"\n");

        var range = doc.createRange();

        // if doc starts with a Text node, domplate fails because the fragment starts
        // with a text node. That must be a gecko bug, but let's just workaround it since
        // we want to switch to innerHTML anyway
        var aDiv = doc.getElementsByTagName("div").item(0);
        range.setStartBefore(aDiv);

        // TODO replace with standard innerHTML
        var frag = range.createContextualFragment(html);

        var root = frag.firstChild;
        root = inserter(frag) || root;

        var domArgs = [root, this.tag.context, 0];
        domArgs.push.apply(domArgs, this.tag.domArgs);
        domArgs.push.apply(domArgs, outputs);

        if (FBTrace.DBG_DOMPLATE)
            FBTrace.sysout("domplate.insertNode domArgs:", domArgs);
        this.tag.renderDOM.apply(self ? self : this.tag.subject, domArgs);

        return root;
    },

    replace: function(args, parent, self)
    {
        if (!args)
            args = {};

        this.tag.compile();

        var outputs = [];
        var html = this.renderHTML(args, outputs, self);

        var root;
        if (parent.nodeType == Node.ELEMENT_NODE)
        {
            parent.innerHTML = html;
            root = parent.firstChild;
        }
        else
        {
            if (!parent || parent.nodeType != Node.DOCUMENT_NODE)
                parent = document;

            if (!womb || womb.ownerDocument != parent)
                womb = parent.createElement("div");
            womb.innerHTML = html;

            root = womb.firstChild;
            //womb.removeChild(root);
        }

        var domArgs = [root, this.tag.context, 0];
        domArgs.push.apply(domArgs, this.tag.domArgs);
        domArgs.push.apply(domArgs, outputs);

        try
        {
            this.tag.renderDOM.apply(self ? self : this.tag.subject, domArgs);
        }
        catch(exc)
        {
            if (FBTrace.DBG_ERRORS)
            {
                FBTrace.sysout("domplate renderDom FAILS " + exc, {exc: exc, renderDOM:
                    this.tag.renderDOM.toSource(), domplate: this, domArgs: domArgs, self: self});
            }

            var chained =  new Error("Domplate.renderDom FAILS: "+exc);
            chained.cause = {exc: exc, renderDOM: this.tag.renderDOM.toSource(),
                domplate: this, domArgs: domArgs, self: self};

            throw chained;
        }

        return root;
    },

    append: function(args, parent, self)
    {
        if (!args)
            args = {};

        this.tag.compile();

        var outputs = [];
        var html = this.renderHTML(args, outputs, self);
        if (FBTrace.DBG_DOMPLATE)
            FBTrace.sysout("domplate.append html: "+html+"\n");

        if (!womb || womb.ownerDocument != parent.ownerDocument)
            womb = parent.ownerDocument.createElement("div");
        womb.innerHTML = html;

        var root = womb.firstChild;
        while (womb.firstChild)
            parent.appendChild(womb.firstChild);

        var domArgs = [root, this.tag.context, 0];
        domArgs.push.apply(domArgs, this.tag.domArgs);
        domArgs.push.apply(domArgs, outputs);

        if (FBTrace.DBG_DOMPLATE)
            FBTrace.sysout("domplate.append domArgs:", domArgs);

        this.tag.renderDOM.apply(self ? self : this.tag.subject, domArgs);

        return root;
    }
};

// ********************************************************************************************* //

function defineTags()
{
    for (var i = 0; i < arguments.length; ++i)
    {
        var tagName = arguments[i];
        var fn = createTagHandler(tagName);
        var fnName = tagName.toUpperCase();

        Domplate[fnName] = fn;
    }

    function createTagHandler(tagName)
    {
        return function() {
            var newTag = new Domplate.DomplateTag(tagName);
            return newTag.merge(arguments);
        };
    }
}

defineTags(
    "a", "button", "br", "canvas", "col", "colgroup", "div", "fieldset", "form", "h1", "h2",
    "h3", "hr", "img", "input", "label", "legend", "li", "ol", "optgroup", "option", "p",
    "pre", "select", "b", "span", "strong", "table", "tbody", "td", "textarea", "tfoot", "th",
    "thead", "tr", "tt", "ul", "iframe", "code", "style",

    // HTML5
    "article", "aside", "audio", "bb", "command", "datagrid", "datalist", "details",
    "dialog", "embed", "eventsource", "figure", "footer", "keygen", "mark", "meter", "nav",
    "output", "progress", "ruby", "rp", "rt", "section", "source", "time", "video"
);

// ********************************************************************************************* //
// Registration

return Domplate;

// ********************************************************************************************* //
});
