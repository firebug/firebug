function runTest()
{
    FBTest.openNewTab(basePath + "console/reps/arrayDisplay.html", function(win)
    {
        FBTest.openFirebug(function()
        {
            FBTest.enableConsolePanel(function(win)
            {
                var expectedArrays =
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
                        expression: /\[\s*"foo"\s*\]/,
                        message: "Arrays created via 'new' must be displayed correctly",
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
                    }
                ];

                var expectedNonArrays =
                [
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
                        expression: /String\s+\{\s*0=\"f\",\s*1=\"o\",\s*2=\"o\"\}/,
                        message: "String objects must not be displayed as array",
                        array: false
                    },
                    {
                        expression: /Object\s+\{\s*0=\"foo\",\s*1=\"bar\",\s*length=2\}/,
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
                        expression: FW.FBL.$STRP("firebug.storage.totalItems", [0]),
                        message: "Session storage must not be displayed as array",
                        array: false
                    }
                ];

                var tasks = new FBTest.TaskList();
                tasks.push(verifyLogs, win, 10, expectedArrays, "logArrays", "Verify array logs");
                tasks.push(verifyLogs, win, 7, expectedNonArrays, "logNonArrays",
                    "Verify non-array logs");

                tasks.run(function()
                {
                    FBTest.testDone();
                });
            });
        });
    });
}

function verifyLogs(callback, win, numberOfLogs, expected, buttonId, message)
{
    FBTest.progress(message);

    FBTest.clearConsole();

    var config = {
        tagName: "div",
        classes: "logRow",
        counter: numberOfLogs
    };

    FBTest.waitForDisplayedElement("console", config, function(row)
    {
        // Let any additional logs to be created (which would be wrong,
        // but we want to catch such case too).
        setTimeout(function()
        {
            onVerify(callback, numberOfLogs, expected);
        }, 200);
    });

    FBTest.click(win.document.getElementById(buttonId));
}

function onVerify(callback, numberOfLogs, expected)
{
    var panelNode = FBTest.getSelectedPanel().panelNode;

    // Iterate over all counters and check that they are equal to 2
    var rows = panelNode.getElementsByClassName("logRow");
    FBTest.compare(numberOfLogs, rows.length, "There must be an expected number of logs");

    for (var i=0; i<rows.length; i++)
    {
        var row = rows[i];

        var objectBox = row.getElementsByClassName("objectBox-array").item(0);
        FBTest.ok(!!objectBox == expected[i].array, expected[i].array ?
            "objectBox should be an array" : "objectBox should not be an array");

        var logContent = row.getElementsByClassName("logContent").item(0);
        FBTest.compare(expected[i].expression, logContent.textContent.trim(), expected[i].message);
    }

    callback();
}
