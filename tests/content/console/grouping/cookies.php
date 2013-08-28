<?php
    setcookie("issue4979", "test");
?>

<!DOCTYPE html>
    <html>
    <head>
        <title>Group console messages: Cookies</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
        <script type="text/javascript">
        function onExecuteTest()
        {
            // The two cookie changes must be grouped
            // (keep the code at the one line)
            deleteCookie("issue4979"); setCookie("issue4979", "value"); setCookie("issue4979", "value"); setCookie("issue4979", "value");
        }

        function deleteCookie(name)
        {
            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        }

        function setCookie(name, value)
        {
            document.cookie = name + "=" + escape(value);
        }
        </script>
    </head>
    <body>
        <header>
            <h1><a href="http://code.google.com/p/fbug/issues/detail?id=4979">Group console messages</a>: Cookies</h1>
        </header>
        <div>
            <section id="content">
                <button id="testButton" onclick="onExecuteTest()">Create cookie events</button>
            </section>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>Enable the <em>Cookies</em> and the <em>Console</em> panel and switch to the <em>Console</em> panel</li>
                    <li>Check the <em>Show Cookie Events</em> option</li>
                    <li>
                        Press the <em>Create cookie events</em> button above<br/>
                        <span class="ok">
                            &rArr; There should be three entries in the console.
                            Only the last one must have set the group counter set to "2".
                        </span>
                    </li>
                    <li>
                        Type <code>document.cookie</code> into the Command Line and hit <kbd>Enter</kbd><br/>
                        <span class="ok">
                            &rArr; A table should be listed displaying one cookie named <code>issue4979</code>.
                            Below the table there should be the raw data displayed as <code>&quot;issue4979=value&quot;</code>. 
                        </span>
                    </li>
                </ol>
                <h3>Expected result</h3>
                <ul>
                    <li>
                        Cookie events may be grouped, cookie data not.
                    </li>
                </ul>
            </section>
            <footer>Jan Odvarko &lt;odvarko@gmail.com&gt;</footer>
        </div>
    </body>
</html>
