function runTest()
{
    FBTest.openNewTab(basePath + "html/style/2440/issue2440.html", function(win)
    {
        function test0(callback)
        {
            executeTest("element1", "element1", callback);
        }

        function test1(callback)
        {
            var frame = win.document.getElementById("testFrame");
            var frameElement = frame.contentWindow.document.getElementById("frameElement");
            executeTest("frameElement", frameElement, callback);
        }

        FBTest.openFirebug(function()
        {
            FBTest.selectPanel("html");

            var tests = [];
            tests.push(test0);
            tests.push(test1);

            FBTest.runTestSuite(tests, function()
            {
                FBTest.testDone();
            });
        });
    });
}

//************************************************************************************************

var instances = [0, 3, 1, 0];

function executeTest(id, element, callback)
{
    // Search for the element within the HTML panel, which
    // automatically expands the tree
    FBTest.selectElementInHtmlPanel(element, function(sel)
    {
        FBTest.sysout("issue2440; selection: ", sel);

        var sidePanel = FBTest.selectSidePanel("css");
        var selectors = sidePanel.panelNode.querySelectorAll(".cssSelector");
        var rules = [];

        for (var i=0; i<selectors.length; i++)
        {
            if (selectors[i].textContent == "#" + id)
            {
                var rule = FW.FBL.getAncestorByClass(selectors[i], "cssRule");
                rules.push(rule);
            }
        }

        if (FBTest.compare(4, rules.length, "There must be four '#" + id + "' CSS rules."))
        {
            for (var i=0; i<rules.length; i++)
            {
                var sourceLink = rules[i].parentNode.querySelector(".objectLink").repObject;
                var fileName = FW.FBL.getFileName(sourceLink.href);

                if (fileName.indexOf("html") == -1)
                {
                    FBTest.compare("issue2440.css", fileName, "Source link must link to 'issue2440.css'");
                    FBTest.compare(instances[i], sourceLink.instance, "Instance of source link must be " + instances[i]);

                    var props = rules[i].querySelectorAll(".cssProp");
                    if (FBTest.ok(props.length == 1, "There must be exactly one property"))
                    {
                        var propName = props[0].querySelector(".cssPropName").textContent;
                        FBTest.compare("background-image", propName, "The property must be 'background-image'");
                    }
                }
            }
        }

        callback();
    });
}