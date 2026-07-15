package com.example.wms.yard.exception;

/**
 * 이미 컨테이너가 존재하는 위치에 적재하려 할 때.
 */
public class LocationFullException extends RuntimeException {
    public LocationFullException(String message) {
        super(message);
    }
}
