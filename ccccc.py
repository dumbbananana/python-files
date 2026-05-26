from unittest import expectedFailure

import requests


def get():
    apikey = "c38ae326a291c5c38c59b29c521f7cad"
    url =f"https://api.openweathermap.org/data/2.5/weather?q={city}&appid={apikey}&units=metric"
    response = requests.get(url)
    value = response.json()
    t = (value["main"]["temp"])
    h = (value["main"]["humidity"])
    print(t)
    print(h)

print("weather predicting app")AAA
while True:
 city = input("enter city name : ")
 if city:
     get()
else:
    print("please enter city name")