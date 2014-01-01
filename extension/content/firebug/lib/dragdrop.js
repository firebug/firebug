/* See license.txt for terms of usage */

define([
    "firebug/lib/object",
    "firebug/lib/events",
],
function(Obj, Events) {

"use strict";

// ********************************************************************************************* //

/**
 *
 * @param {Object} element
 * @param {Object} handle
 * @param {Object} callbacks: onDragStart, onDragOver, onDragLeave, onDrop
 */
function Tracker(handle, callbacks)
{
    this.element = handle;
    this.handle = handle;
    this.callbacks = callbacks;

    this.cursorStartPos = null;
    this.cursorLastPos = null;
    //this.elementStartPos = null;
    this.dragging = false;

    // Start listening
    this.onDragStart = Obj.bind(this.onDragStart, this);
    this.onDragOver = Obj.bind(this.onDragOver, this);
    this.onDrop = Obj.bind(this.onDrop, this);

    Events.addEventListener(this.element, "mousedown", this.onDragStart, false);
    this.active = true;
}

Tracker.prototype =
{
    onDragStart: function(event)
    {
        if (this.dragging)
            return;

        if (this.callbacks.onDragStart)
            this.callbacks.onDragStart(this);

        this.dragging = true;
        this.cursorStartPos = absoluteCursorPostion(event);
        this.cursorLastPos = this.cursorStartPos;
        //this.elementStartPos = new Position(
        //    parseInt(this.element.style.left),
        //    parseInt(this.element.style.top));

        Events.addEventListener(this.element.ownerDocument, "mousemove", this.onDragOver, false);
        Events.addEventListener(this.element.ownerDocument, "mouseup", this.onDrop, false);

        Events.cancelEvent(event);
    },

    onDragOver: function(event)
    {
        if (!this.dragging)
            return;

        Events.cancelEvent(event);

        var newPos = absoluteCursorPostion(event);
        //newPos = newPos.Add(this.elementStartPos);
        newPos = newPos.Subtract(this.cursorStartPos);
        //newPos = newPos.Bound(lowerBound, upperBound);
        //newPos.Apply(this.element);

        // Only fire event if the position has beeb changed.
        if (this.cursorLastPos.x == newPos.x && this.cursorLastPos.y == newPos.y)
            return;

        this.cursorLastPos = newPos;

        if (this.callbacks.onDragOver != null)
            this.callbacks.onDragOver(newPos, this);
    },

    onDrop: function(event)
    {
        if (!this.dragging)
            return;

        Events.cancelEvent(event);

        this.dragStop();
    },

    dragStop: function()
    {
        if (!this.dragging)
            return;

        Events.removeEventListener(this.element.ownerDocument, "mousemove", this.onDragOver, false);
        Events.removeEventListener(this.element.ownerDocument, "mouseup", this.onDrop, false);

        this.cursorStartPos = null;
        this.cursorLastPos = null;
        //this.elementStartPos = null;

        if (this.callbacks.onDrop != null)
            this.callbacks.onDrop(this);

        this.dragging = false;
    },

    destroy: function()
    {
        Events.removeEventListener(this.element, "mousedown", this.onDragStart, false);
        this.active = false;

        if (this.dragging)
            this.dragStop();
    }
};

// ********************************************************************************************* //

function Position(x, y)
{
    this.x = x;
    this.y = y;

    this.Add = function(val)
    {
        var newPos = new Position(this.x, this.y);
        if (val != null)
        {
            if(!isNaN(val.x))
                newPos.x += val.x;
            if(!isNaN(val.y))
                newPos.y += val.y;
        }
        return newPos;
    };

    this.Subtract = function(val)
    {
        var newPos = new Position(this.x, this.y);
        if (val != null)
        {
            if(!isNaN(val.x))
                newPos.x -= val.x;
            if(!isNaN(val.y))
                newPos.y -= val.y;
        }
        return newPos;
    };

    this.Bound = function(lower, upper)
    {
        var newPos = this.Max(lower);
        return newPos.Min(upper);
    };

    this.Check = function()
    {
        var newPos = new Position(this.x, this.y);
        if (isNaN(newPos.x))
            newPos.x = 0;

        if (isNaN(newPos.y))
            newPos.y = 0;

        return newPos;
    };

    this.Apply = function(element)
    {
        if (typeof(element) == "string")
            element = document.getElementById(element);

        if (!element)
            return;

        if(!isNaN(this.x))
            element.style.left = this.x + "px";

        if(!isNaN(this.y))
            element.style.top = this.y + "px";
    };
}

// ********************************************************************************************* //

function absoluteCursorPostion(e)
{
    if (isNaN(window.scrollX))
    {
        return new Position(e.clientX + document.documentElement.scrollLeft
            + document.body.scrollLeft, e.clientY + document.documentElement.scrollTop
            + document.body.scrollTop);
    }
    else
    {
        return new Position(e.clientX + window.scrollX, e.clientY + window.scrollY);
    }
}

// ********************************************************************************************* //

var DragDrop = {};
DragDrop.Tracker = Tracker;

// ********************************************************************************************* //
// Registration

return DragDrop;

// ********************************************************************************************* //
});
