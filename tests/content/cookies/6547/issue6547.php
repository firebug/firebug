<?php
    header("Set-Cookie: issue6547_zero=Hello Firebug user!; Max-Age=0", false);
    header("Set-Cookie: issue6547_pos=Hello Firebug user!; Max-Age=123456", false);
    header("Set-Cookie: issue6547_neg=Hello Firebug user!; Max-Age=-123456", false);
?>
<!DOCTYPE html>
<html>
    <head>
        <title>Issue 6547: Show cookie Max-Age when attribute is <= 0</title>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <link href="../../_common/testcase.css" type="text/css" rel="stylesheet"/>
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
                        <ul>
                                <li>There should be a <em>Max. Age</em> column showing the value <code>0ms</code> for cookie <em>issue6547_zero</em></li>
                                <li>There should be a <em>Max. Age</em> column showing the value <code>1d 10h 17m 36s</code> for cookie <em>issue6547_pos</em></li>
                                <li>There should be a <em>Max. Age</em> column showing the value <code>-1d 10h 17m 36s</code> for cookie <em>issue6547_neg</em></li>
                        </ul>
                    </li>
                </ul>
            </section>
            <footer>Awad Mackie, firesock.serwalek@gmail.com</footer>
        </div>
    </body>
</html>
