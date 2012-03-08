<?php
header( 'HTTP/1.1 401 Authorization Required', TRUE, 401 );
header( 'WWW-Authenticate: Basic realm="Protected Area - login: test/test"', TRUE );
echo 'TEST';
?>