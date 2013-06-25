<?php
    header("Set-Cookie: issue6547=Hello Firebug user!; Max-Age=0");
?>
<!DOCTYPE html>
<html>
    <head>
        <title>Issue 6547: Show cookie Max-Age when attribute is <= 0</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="https://getfirebug.com/tests/head/_common/testcase.css" type="text/css" rel="stylesheet"/>
    </head>
    <body>
        <header>
            <h1><a href="http://code.google.com/p/fbug/issues/detail?id=6547">Issue 6547</a>: Show cookie Max-Age when attribute is <= 0</h1>
        </header>
        <div>
            <section id="description">
                <h3>Steps to reproduce</h3>
                <ol>
                    <li>Open Firebug</li>
                    <li>Enable and switch to the <em>Net</em> panel</li>
                    <li>Reload the page</li>
                    <li>Expand the request to <em>issue6547.php</em><br/></li>
                    <li>Switch to the <em>Cookies</em> info tab</li>
                    <li>
                        There should be a <em>Max. Age</em> column showing the value <code>0ms</code>
                    </li>
                </ul>
            </section>
            <footer>Awad Mackie, firesock.serwalek@gmail.com</footer>
        </div>
    </body>
</html>
