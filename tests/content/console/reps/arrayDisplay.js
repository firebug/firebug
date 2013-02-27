function runTest()
{
    FBTest.sysout("arrayDisplay.START");

    FBTest.openNewTab(basePath + "console/reps/arrayDisplay.html", function(win)
    {
        FBTest.openFirebug();

        FBTest.enableConsolePanel(function(win)
        {
            FBTest.selectPanel("console");

            var config = {tagName: "div", classes: "logRow", counter: 15};
            FBTest.waitForDisplayedElement("console", config, function(row)
            {
                var panel = FBTest.getSelectedPanel();
                var rows = panel.panelNode.getElementsByClassName("logContent");

                var expected =
                [
                     {
                         expression: /\[\s*\]/,
                         message: "Empty array must be displayed correctly",
                         array: true
                     },
                     {
                         expression: /\[\s*1\s*\]/,
                         message: "Number array must be displayed correctly",
                         array: true
                     },
                     {
                         expression: /\[\s*"foo"\s*\]/,
                         message: "String array must be displayed correctly",
                         array: true
                     },
                     {
                         expression: /\[\s*1\s*,\s*"foo"\s*,\s*Window\s+arrayDisplay.html\s*\]/,
                         message: "Array with multiple items must be displayed correctly",
                         array: true
                     },
                     {
                         expression: /\[\s*undefined\s*,\s*undefined\s*,\s*undefined\s*\]/,
                         message: "Array with multiple undefined items must be displayed correctly",
                         array: true
                     },
                     {
                         expression: /\HTMLCollection\s*\[\s*div\s*\]/,
                         message: "HTMLCollections must be displayed as array",
                         array: true
                     },
                     {
                         expression: new RegExp("NodeList\\s*\\[\\s*head\\s*,\\s*<TextNode\\s+" +
                             "textContent=\\\"\\\\n    \\\">\\s*,\\s*body\\s*\\]"),
                         message: "NodeLists must be displayed as array",
                         array: true
                     },
                     {
                         expression: /\[\s*1\s*,\s*"foo"\s*,\s*Window\s+arrayDisplay.html\s*\]/,
                         message: "Arrays returned by functions must be displayed correctly",
                         array: true
                     },
                     {
                         expression: /\[\s*\]/,
                         message: "Empty arrays with user-defined properties must be displayed " +
                             "correctly",
                         array: true
                     },
                     {
                         expression: "undefined",
                         message: "'undefined' must not be displayed as array",
                         array: false
                     },
                     {
                         expression: "1",
                         message: "Numbers must not be displayed as array",
                         array: false
                     },
                     {
                         expression: "foo",
                         message: "Strings must not be displayed as array",
                         array: false
                     },
                     {
                         expression: new RegExp("Object\\s*\\{\\s*0\\s*=\\s*\\\"foo\\\"\\s*,\\s*" +
                             "1\\s*=\\s*\\\"bar\\\"\\s*,\\s*length\\s*=\\s*2\\s*\\}"),
                         message: "Objects must not be displayed as array",
                         array: false
                     },
                     {
                         expression: /NotAnArray\s*\{\s*data\s*=\s*"this is not Array"\s*\}/,
                         message: "Object created by a constructor that includes the word " +
                             "\"Array\" must not be displayed as array",
                         array: false
                     },
                     {
                         expression: "0 items in Storage",
                         message: "Session storage must not be displayed as array",
                         array: false
                     }
                ];

                for (var i = 0, len = rows.length; i < len; ++i)
                {
                    var objectBox = rows[i].getElementsByClassName("objectBox-array").item(0);
                    FBTest.ok(!!objectBox == expected[i].array, expected[i].array ?
                        "objectBox should be an array" : "objectBox should not be an array"); 
                    FBTest.compare(expected[i].expression, rows[i].textContent.trim(),
                        expected[i].message);
                }
                
                FBTest.testDone("arrayDisplay.DONE");
            });

            FBTest.reload();
        });
    });
}
