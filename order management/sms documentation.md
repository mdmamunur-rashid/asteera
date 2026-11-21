#Fetch Request

    let msg = 'SMS Success';
    let apikey = YOUR_API_KEY;
    let sender = "8809617171817";
    let msisdn = 01XXXXXXXXX;

    async function send() {
        try {
            const response = await fetch('https://api.automas.com.bd/smsapiv3?apikey=apikey&sender=sender&msisdn=msisdn&smstext=msg');
            const data = await response.json();
            console.log(data);
        } catch (error) {
            console.error(error);
        }
    }

    send();
    #Axios Request

import axios from "axios";
axios
.get("https://api.automas.com.bd/smsapiv3?apikey=apikey&sender=sender&msisdn=msisdn&smstext=msg")
.then((response) => {
    console.log(response.data);
})
.catch((error) => console.error(error));
#XMLHttpRequest
const xhr = new XMLHttpRequest();
xhr.open('GET', 'https://api.automas.com.bd/smsapiv3?apikey=YOUR_API_KEY&sender=8809617171817&msisdn=01XXXXXXXXX&smstext=SMS Success');
xhr.onload = function() {
    if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        console.log(data);
    } else {
        console.error(`Error: ${xhr.status}`);
    }
};
xhr.onerror = function() {
    console.error('Request error');
};
xhr.send(););