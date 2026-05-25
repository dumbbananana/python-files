import requests


def get():
    apikey = "c38ae326a291c5c38c59b29c521f7cad"
    url =f"https://api.openweathermap.org/data/2.5/weather?q={city}&appid={apikey}&units=metric"
    response = requests.get(url)
    value = response.json()
    print(value["main"]["temp"]["cod"],"˚c")

print("weather predicting app")
while True:
 city = input("enter city name : ")
 get()
