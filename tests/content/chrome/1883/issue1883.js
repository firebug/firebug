// Test entry point.
function runTest()
{
    var Firebug = FBTest.FirebugWindow.Firebug;
    var FBTrace = FBTest.FirebugWindow.FBTrace;

    FBTest.openNewTab(basePath + "chrome/1883/issue1883.html", function(win)
    {
        FBTest.progress("Document ready state: " + win.document.readyState);
        FBTest.progress("Location: " + win.location);

        if ((win.location + "").indexOf("issue1883.html") == -1)
        {
            FBTest.ok(false, "Wrong test page location");
            setTimeout(function()
            {
                FBTest.progress("Location again: " + win.location);
                FBTest.testDone();
            }, 800);
            return;
        }

        win = FBTest.FirebugWindow.FBL.getContentView(win);

        FBTest.progress("Test page opened " + win);

        with (FBTest.FirebugWindow.FBL) { with (FBTest.FirebugWindow)
        {
            function ArrayIterator(array)
            {
                var index = -1;

                this.next = function()
                {
                    if (++index >= array.length)
                        $break();
                    return array[index];
                };
            }

            var rowTag = domplate({
                tag: TR(TD(DIV({_testProp: "$test", onclick: "$onclick"},"$test"))),
                onclick: function() { alert('test'); }
            });
            var iterTag = domplate({
                tag: FOR("test", "$test|testIter", rowTag.tag),

                testIter: function()
                {
                    // Need a custom iterator here as we are in a different window
                    return new ArrayIterator([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ]);
                }
            });

            function checkResults(count)
            {
                FBTest.compare(count, rows.length, "Row Count");
                for (var i = 0; i < rows.length; i++)
                    FBTest.compare(i%11, rows[i].firstChild.firstChild.testProp, "Row property");
            }

            var table = win.document.createElement("table");
            var tbody = win.document.createElement("tbody");
            table.appendChild(tbody);

            FBTest.progress("table created " + table);

            iterTag.tag.insertRows({ test: 10 }, tbody);

            var rows = table.getElementsByTagName("tr");
            checkResults(10);

            rowTag.tag.insertRows({ test: 10 }, rows[rows.length-1] );
            checkResults(11);

            FBTest.testDone();
        }}
    });
}