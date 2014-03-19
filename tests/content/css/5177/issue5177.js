function runTest()
{
    FBTest.openNewTab(basePath + "css/5177/issue5177.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");
            FBTest.selectElementInHtmlPanel("element1", function(node)
            {
                var panel = FBTest.selectSidePanel("css");
                var values = panel.panelNode.querySelectorAll(".cssPropValue");

                // Click the CSS value of the background property to open the inline editor
                FBTest.synthesizeMouse(values[0]);

                var text = panel.panelNode.querySelector(".textEditorInner");

                var tasks = new FBTest.TaskList();
                tasks.push(fuzzIncrements, text, "#9af ", true, 3865736374);
                tasks.push(fuzzIncrements, text, "#9af ", false, 2321243364);
                tasks.push(fuzzIncrements, text, "rgba(1,3, 9,0)", false, 1057413430);
                tasks.push(fuzzIncrements, text, "hsla(3,30%,9%,0", false, 1395508803);

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

// ********************************************************************************************* //
// Tasks

function fuzzIncrements(callback, text, initialValue, setSelection, expected)
{
    // Make Firebug.Editor.update a no-op temporarily, for it is too slow.
    // (This does not change the outcome of the test.)
    var oldUpdate = FW.Firebug.Editor.update;
    FW.Firebug.Editor.update = function () {};

    try {
        var hasher = new RNG, random = new RNG;
        text.value = initialValue;
        for (var iter = 0; iter < 200; ++iter)
        {
            var selEnd = random.get(text.value.length+1);
            var selStart = (setSelection ? random.get(selEnd+1) : selEnd);
            text.setSelectionRange(selStart, selEnd);

            var key = (random.get(10) < 5 ? "VK_UP" : "VK_DOWN");
            if (random.get(10) < 1)
            {
                // A very large increment.
                for (var i = 0; i < 10; ++i)
                    FBTest.sendShortcut(key, {shiftKey: true});
            }
            else
            {
                var obj = {};
                if (random.get(10) < 3)
                    obj.shiftKey = true;
                else if (random.get(10) < 5)
                    obj.ctrlKey = true;
                FBTest.sendShortcut(key, obj);
            }
            hasher.feed(text.selectionStart);
            hasher.feed(text.selectionEnd);
            hasher.feed(text.value);
        }
        FBTest.compare(expected, hasher.rand32(), "Hashes must match");
    }
    finally
    {
        FW.Firebug.Editor.update = oldUpdate;
    }
    setTimeout(function() {
        callback();
    });
}


// ********************************************************************************************* //
// Helpers

// A basic linear congruential RNG.
function RNG()
{
    var Max = 0x100000000;
    this.value = 0x45fabe;

    this.feed = function(val)
    {
        if (typeof val === "string")
        {
            var hash = 0;
            for (var i = 0; i < val.length; ++i)
            {
                hash += val.charCodeAt(i);
                hash *= 0x147;
                hash &= 0xffffffff;
            }
            this.feed(hash);
        }
        else
        {
            this.next();
            this.value = (this.value ^ val) >>> 0;
        }
    };

    this.next = function(to)
    {
        var mult = (this.value & 0xffff) * 0x33c90000 + this.value * 0xfa33;
        this.value = (mult + 0x2f9c6237) >>> 0;
    };

    this.rand32 = function()
    {
        this.next();
        return this.value;
    }

    this.get = function(to)
    {
        this.next();
        return Math.floor(this.value * to / Max);
    };
}
