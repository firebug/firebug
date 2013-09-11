<?php
    setcookie("TestCookieIssue6525", "a value");
?>

<!DOCTYPE html>
<html>
    <head>
        <title>Issue 6525: Expose non-chrome objects for "Use in Command Line" in Net and Cookies panels</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
        <script>

        </script>
    </head>
    <body>
        <header>
            <h1><a href="http://code.google.com/p/fbug/issues/detail?id=6525">Issue 6525</a>:
                Expose non-chrome objects for "Use in Command Line" in Net and Cookies panels</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>Enable the Console, Net and Cookies panels</li>
                    <li>Switch to the Net panel</li>
                    <li>Right click on the <i>issue6525.php</i> request and pick <i>Use in Command Line</i></li>
                    <li>Type <code>$p.responseHeaders[0].name</code> into the Command Line</li>
                    <li>The command output should be a string.</li>
                    <br/>
                    <li>Switch to the Cookies panel</li>
                    <li>Right click on the <i>TestCookieIssue6525</i> cookie and pick <i>Use in Command Line</i></li>
                    <li>Type <code>$p.name</code> into the Command Line</li>
                    <li>The command output should be: <code style="color:red">TestCookieIssue6525</code></li>
                </ol>
            </section>
            <footer>
                Jan Odvarko, odvarko@gmail.com
            </footer>
        </div>
    </body>
</html>
