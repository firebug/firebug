/* See license.txt for terms of usage */

define([], function() {

// ********************************************************************************************* //
// Constants

function SourceLink(url, line, type, object, instance, col)
{
    this.href = url;
    this.instance = instance;
    this.line = line;
    this.type = type;
    this.object = object;
    this.col = col;
};

SourceLink.prototype =
{
    toString: function()
    {
        return this.href+"@"+(this.line || '?');
    },

    toJSON: function() // until 3.1...
    {
        return "{\"href\":\""+this.href+"\", "+
            (this.line?("\"line\":"+this.line+","):"")+
            (this.type?(" \"type\":\""+this.type+"\","):"")+
                    "}";
    }
};

// ********************************************************************************************* //
// Registration

return {
    SourceLink: SourceLink
};

// ********************************************************************************************* //
});
